// Lifecycle for the built-in language model.
//
// The service is lazy in both directions. Nothing is loaded until the first
// HyperFrames generation asks for it, and the whole worker — model, KV cache
// and all 2.3 GiB of it — is retired again after an idle period, so an editor
// session that never generates a graphic never pays for one.
//
// Shape follows `desktop/native-asr-service.ts`: an injectable worker factory,
// a pending-request map keyed by request id, structural validation of every
// message crossing the process boundary, and a hard timeout that fails the
// worker rather than hanging a route. What differs is where it runs. Native ASR
// is desktop-only and forks an Electron UtilityProcess; this service also has to
// work in the Vite dev server, so it falls back to `child_process.fork` of the
// same built worker when Electron is not around.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { fork } from 'node:child_process';
import {
  parseBuiltinLlmResponse,
  type BuiltinLlmMessage,
  type BuiltinLlmRequest,
} from '../../shared/builtin-llm.ts';

/** A worker, reduced to what the service needs from it. */
export interface BuiltinLlmWorker {
  postMessage(value: unknown): void;
  on(event: 'message', handler: (value: unknown) => void): void;
  on(event: 'exit', handler: (code: number) => void): void;
  kill(): void;
}

export interface BuiltinLlmServiceOptions {
  /** Absolute path of the verified GGUF file. */
  readonly modelPath: string;
  readonly contextSize: number;
  readonly maxOutputTokens: number;
  /** Retire the worker after this long with nothing in flight. */
  readonly idleTimeoutMs?: number;
  /** Fail a generation that has not answered in this long. */
  readonly requestTimeoutMs?: number;
  readonly createWorker?: (workerPath: string) => BuiltinLlmWorker;
  /** Resolves the built worker's entry file; injectable for tests. */
  readonly resolveWorkerPath?: () => string;
}

export interface BuiltinLlmGenerateOptions {
  readonly system: string;
  readonly messages: readonly BuiltinLlmMessage[];
  readonly temperature?: number;
}

/** Cold model load on Apple Silicon is under a second; a slow disk is not. */
const DEFAULT_LOAD_TIMEOUT_MS = 120_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;
/** Long enough to cover a repair loop and a second prompt; short enough to give the RAM back. */
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60_000;

interface Pending {
  readonly resolve: (text: string) => void;
  readonly reject: (reason: Error) => void;
  readonly timer: NodeJS.Timeout;
}

const require = createRequire(import.meta.url);

/** True when node-llama-cpp resolves with a prebuilt binary for this platform. */
export function builtinLlmRuntimeAvailable(
  resolve: (specifier: string) => string = (specifier) => require.resolve(specifier),
): boolean {
  try {
    resolve('node-llama-cpp');
    return true;
  } catch {
    return false;
  }
}

/**
 * The built worker file. `desktop:build:main` esbuilds it next to the other
 * native workers, and `predev` builds it too so `npm run dev` has one.
 *
 * There are two places this module can be running from, and the worker sits in
 * a different spot relative to each:
 *   - packaged: this file has been esbuilt *into* `desktop-dist/main.mjs`, so
 *     the worker is a plain sibling of the bundle.
 *   - from source (`npm run dev`, tsx): this file is
 *     `server/builtin-llm/service.ts`, so the worker is two levels up in
 *     `desktop-dist/`.
 * Guessing one broke every installed build — the packaged app climbed a level
 * too far and looked for the worker in `resources/desktop-dist/` — so try both
 * and take whichever actually exists.
 *
 * fileURLToPath, never `URL.pathname`: an install path containing a space (or
 * any other character a URL escapes) comes back percent-encoded from pathname
 * and the fork then fails with ENOENT on a path that visibly exists. This
 * checkout lives under "Mobile Documents", which is exactly that case.
 */
export function resolveBuiltinLlmWorkerPath(
  moduleUrl: string = import.meta.url,
  exists: (path: string) => boolean = existsSync,
): string {
  const bundled = fileURLToPath(new URL('./builtin-llm-worker.mjs', moduleUrl));
  const fromSource = fileURLToPath(new URL('../../desktop-dist/builtin-llm-worker.mjs', moduleUrl));
  for (const candidate of [bundled, fromSource]) {
    if (exists(candidate)) return candidate;
  }
  throw new Error(
    'The built-in model helper is missing. It was not found next to the app at '
    + `${bundled}, nor in the build folder at ${fromSource}. `
    + 'Run "npm run desktop:build:main" to build it, or reinstall the app.',
  );
}

function defaultWorkerPath(): string {
  return resolveBuiltinLlmWorkerPath();
}

function defaultCreateWorker(workerPath: string): BuiltinLlmWorker {
  // Electron's utilityProcess when we are inside Electron, a plain child
  // process otherwise. Both give the same duplex message channel.
  try {
    const electron = require('electron') as {
      utilityProcess?: {
        fork(path: string, args: readonly string[], options: { serviceName: string }): BuiltinLlmWorker;
      };
    };
    if (electron.utilityProcess) {
      return electron.utilityProcess.fork(workerPath, [], {
        serviceName: 'Aquarius Editor Built-in LLM',
      });
    }
  } catch {
    // Not running under Electron — the dev server path below is the right one.
  }
  const child = fork(workerPath, [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  return {
    postMessage: (value) => { child.send(value as never); },
    on: ((event: string, handler: (value: never) => void) => {
      child.on(event === 'message' ? 'message' : 'exit', handler as never);
    }) as BuiltinLlmWorker['on'],
    kill: () => { child.kill(); },
  };
}

let nextRequestId = 0;

export class BuiltinLlmService {
  private readonly options: Required<Pick<BuiltinLlmServiceOptions,
    'modelPath' | 'contextSize' | 'maxOutputTokens' | 'idleTimeoutMs' | 'requestTimeoutMs'>>;
  private readonly createWorker: (workerPath: string) => BuiltinLlmWorker;
  private readonly resolveWorkerPath: () => string;
  private readonly pending = new Map<string, Pending>();
  private worker: BuiltinLlmWorker | null = null;
  private ready: Promise<void> | null = null;
  private readySettle: { resolve: () => void; reject: (error: Error) => void } | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private disposed = false;
  /** Last backend the worker reported, for logging and the config route. */
  backend = '';

  constructor(options: BuiltinLlmServiceOptions) {
    this.options = {
      modelPath: options.modelPath,
      contextSize: options.contextSize,
      maxOutputTokens: options.maxOutputTokens,
      idleTimeoutMs: options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    };
    this.createWorker = options.createWorker ?? defaultCreateWorker;
    this.resolveWorkerPath = options.resolveWorkerPath ?? defaultWorkerPath;
  }

  /** True while the model is loaded — used by the config route and by tests. */
  get loaded(): boolean {
    return this.worker !== null;
  }

  async generate(request: BuiltinLlmGenerateOptions): Promise<string> {
    if (this.disposed) throw new Error('the built-in model service is disposed');
    this.clearIdleTimer();
    await this.ensureReady();
    const requestId = `hf-${(nextRequestId += 1)}`;
    const deferred = Promise.withResolvers<string>();
    const timer = setTimeout(
      () => this.failWorker(new Error('the built-in model did not answer in time')),
      this.options.requestTimeoutMs,
    );
    this.pending.set(requestId, { resolve: deferred.resolve, reject: deferred.reject, timer });
    this.post({
      type: 'generate',
      requestId,
      system: request.system,
      messages: request.messages.map((message) => ({ role: message.role, content: message.content })),
      maxTokens: this.options.maxOutputTokens,
      temperature: request.temperature ?? 0.2,
    });
    try {
      return await deferred.promise;
    } finally {
      this.scheduleIdleRetirement();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearIdleTimer();
    this.failWorker(new Error('the built-in model service is disposed'));
  }

  private ensureReady(): Promise<void> {
    if (this.ready) return this.ready;
    const deferred = Promise.withResolvers<void>();
    this.ready = deferred.promise;
    this.readySettle = { resolve: deferred.resolve, reject: deferred.reject };
    let worker: BuiltinLlmWorker;
    try {
      worker = this.createWorker(this.resolveWorkerPath());
    } catch (error) {
      const reason = error instanceof Error ? error : new Error(String(error));
      this.settleReady(reason);
      this.ready = null;
      return Promise.reject(reason);
    }
    this.worker = worker;
    worker.on('message', (value: unknown) => {
      if (this.worker === worker) this.handleMessage(value);
    });
    worker.on('exit', (code: number) => {
      if (this.worker !== worker) return;
      this.failWorker(new Error(`the built-in model process exited with code ${code}`));
    });
    const loadTimer = setTimeout(
      () => this.failWorker(new Error('the built-in model did not finish loading in time')),
      DEFAULT_LOAD_TIMEOUT_MS,
    );
    void deferred.promise.finally(() => clearTimeout(loadTimer)).catch(() => undefined);
    this.post({
      type: 'initialize',
      modelPath: this.options.modelPath,
      contextSize: this.options.contextSize,
    });
    return this.ready;
  }

  private post(request: BuiltinLlmRequest): void {
    try {
      this.worker?.postMessage(request);
    } catch (error) {
      this.failWorker(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private handleMessage(value: unknown): void {
    const message = parseBuiltinLlmResponse(value);
    if (!message) {
      this.failWorker(new Error('the built-in model process sent an invalid message'));
      return;
    }
    if (message.type === 'ready') {
      this.backend = message.gpu;
      this.settleReady();
      return;
    }
    if (message.type === 'result') {
      this.settle(message.requestId, undefined, message.text);
      return;
    }
    // A load failure has no request id and poisons everything queued behind it.
    if (message.requestId === undefined) {
      this.failWorker(new Error(message.message));
      return;
    }
    this.settle(message.requestId, new Error(message.message));
  }

  private settleReady(error?: Error): void {
    const settle = this.readySettle;
    this.readySettle = null;
    if (!settle) return;
    if (error) settle.reject(error);
    else settle.resolve();
  }

  private settle(requestId: string, error?: Error, text?: string): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    clearTimeout(pending.timer);
    if (error) pending.reject(error);
    else pending.resolve(text ?? '');
  }

  /** Retire the worker and fail everything still waiting on it. */
  private failWorker(error: Error): void {
    const worker = this.worker;
    this.worker = null;
    this.ready = null;
    this.settleReady(error);
    if (worker) {
      try {
        worker.kill();
      } catch {
        // Exit is the retirement boundary; a failed kill does not change that.
      }
    }
    for (const [requestId] of this.pending) this.settle(requestId, error);
  }

  private clearIdleTimer(): void {
    if (!this.idleTimer) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  /** Give the memory back once the editor has clearly stopped generating. */
  private scheduleIdleRetirement(): void {
    this.clearIdleTimer();
    if (this.disposed || this.pending.size > 0 || !this.worker) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.pending.size > 0) return;
      const worker = this.worker;
      this.worker = null;
      this.ready = null;
      try {
        worker?.kill();
      } catch {
        // Best effort: the next generation forks a fresh worker either way.
      }
    }, this.options.idleTimeoutMs);
    this.idleTimer.unref?.();
  }
}
