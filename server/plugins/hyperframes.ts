// HyperFrames generation: prompt in → one host-contract composition out.
//
// The route reuses the existing LLM plumbing verbatim — the same keystore
// configuration the agent runs read, the same provider SDK factory, and the same
// local `/llm` proxy that injects the real key server-side. Nothing about the
// removed chat UI is resurrected; this is one stateless POST.
//
// It also has somewhere to go when nothing is configured. A quantized 4B model
// (`shared/llm-model-catalog.ts`) runs locally through llama.cpp, and this route
// falls back to it, so an install generates a graphic with no setup at all. Those
// weights are 2.33 GiB and cannot ride inside the installer — GitHub refuses a
// release asset that large — so the app fetches them itself in the background on
// first launch (`server/builtin-llm/download.ts`). While that is happening this
// route reports `model-downloading`, which is a "nearly there", not a fault.
// Anything the user has explicitly configured wins — the built-in model is the
// floor, never a ceiling.
//
// The generated source is linted against `shared/hyperframes-contract.ts` AND
// compiled and rendered through `server/hyperframes-compile.ts` before it is
// returned, and a failing draft is sent back to the model with its own errors up
// to the repair ceiling. A composition that leaves this route is one the
// browser's template host can compile and run.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { generateText } from 'ai';
import { getKey, type KeyName } from '../keystore.ts';
import {
  BUILTIN_LLM_PROVIDER,
  BUILTIN_LLM_PROVIDER_LABEL,
  defaultModelForProvider,
  isLocalLlmProvider,
  llmProviderPreset,
  normalizeLlmProvider,
  normalizeOpenAiApiMode,
} from '../../shared/llm-providers.ts';
import { resolveLlmProviderConfig } from '../llm-config.ts';
import { createServerLanguageModel } from '../agent-runs/model.ts';
import { requestOrigin } from '../agent-runs/request.ts';
import {
  clampHyperframesDuration,
  lintHyperframesComposition,
  stripCodeFences,
} from '../../shared/hyperframes-contract.ts';
import {
  HYPERFRAMES_REFERENCE_CODE_BUDGET,
  hyperframesRepairPrompt,
  hyperframesSystemPrompt,
  hyperframesUserPrompt,
  truncateHyperframesReferenceCode,
  type HyperframesRevisionContext,
} from '../../shared/hyperframes-prompt.ts';
import { compileHyperframesComposition } from '../hyperframes-compile.ts';
import { stripReasoningBlocks } from '../../shared/builtin-llm.ts';
import {
  BuiltinLlmService,
  builtinLlmRuntimeAvailable,
} from '../builtin-llm/service.ts';
import {
  builtinLlmModelProblem,
  builtinLlmModelState,
  type BuiltinLlmModelState,
  type BuiltinLlmProblem,
} from '../builtin-llm/model-file.ts';
import { builtinLlmDownloadInFlight } from '../builtin-llm/download.ts';

/** Two repairs after the first attempt — three model calls at the very worst. */
export const MAX_HYPERFRAMES_REPAIRS = 2;
/**
 * The built-in model gets one more. A frontier model that fails twice is not
 * going to succeed on a third identical nudge, but the 4B one measurably does:
 * across the benchmark runs behind this feature, every draft it failed on was a
 * render-time throw that the compile stage described precisely, and the extra
 * turn converts those instead of throwing the work away. A local repair also
 * costs the user nothing but a few seconds — no tokens, no request.
 */
export const MAX_BUILTIN_HYPERFRAMES_REPAIRS = 3;
const MAX_PROMPT_CHARS = 4000;
const MAX_NOTES_CHARS = 2000;
const MAX_BODY_BYTES = 64 * 1024;
const GENERATION_TIMEOUT_MS = 180_000;

export interface HyperframesRequest {
  readonly prompt: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationInFrames: number;
  /**
   * Set when the browser asked for a revision of an earlier generation. The
   * reference source arrives from the project's own media pool — it is source
   * this app authored, never a file path and never anything read off disk.
   */
  readonly revision?: HyperframesRevisionContext;
}

export interface HyperframesComposition {
  readonly code: string;
  /** Component name the host will resolve — derived from the source, never guessed. */
  readonly componentName: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationInFrames: number;
}

export type HyperframesOutcome =
  | { readonly ok: true; readonly composition: HyperframesComposition; readonly attempts: number }
  | { readonly ok: false; readonly error: string; readonly attempts: number; readonly lastErrors: readonly string[] };

/** One model call: system + running message list in, raw text out. */
export type HyperframesAuthor = (input: {
  readonly system: string;
  readonly messages: ReadonlyArray<{ readonly role: 'user' | 'assistant'; readonly content: string }>;
}) => Promise<string>;

/**
 * Contract lint first (cheap, and it is what rejects unsafe constructs), then a
 * real compile and render (which is what catches a draft that reads a `const`
 * before its initializer). Only a draft that passes both is a composition.
 */
async function inspectComposition(
  code: string,
  request: HyperframesRequest,
): Promise<{ readonly name: string; readonly errors: readonly string[] }> {
  const lint = lintHyperframesComposition(code);
  if (!lint.ok) return { name: lint.name, errors: lint.errors };
  const compiled = await compileHyperframesComposition(code, {
    width: request.width,
    height: request.height,
    fps: request.fps,
    durationInFrames: request.durationInFrames,
  });
  return { name: lint.name, errors: compiled.errors };
}

/**
 * The generation loop, with the model call injected so it can be exercised
 * without a network. Draft → lint → compile → (repair with the errors) → accept.
 */
export async function runHyperframesGeneration(
  request: HyperframesRequest,
  author: HyperframesAuthor,
  maxRepairs: number = MAX_HYPERFRAMES_REPAIRS,
): Promise<HyperframesOutcome> {
  const system = hyperframesSystemPrompt();
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: hyperframesUserPrompt(request) },
  ];
  let lastErrors: readonly string[] = ['the model produced no output'];
  for (let attempt = 1; attempt <= maxRepairs + 1; attempt += 1) {
    let raw: string;
    try {
      raw = await author({ system, messages });
    } catch (error) {
      return {
        ok: false,
        attempts: attempt,
        error: error instanceof Error ? error.message : String(error),
        lastErrors,
      };
    }
    const code = stripCodeFences(raw);
    const inspected = await inspectComposition(code, request);
    if (inspected.errors.length === 0) {
      return {
        ok: true,
        attempts: attempt,
        composition: {
          code,
          componentName: inspected.name,
          width: request.width,
          height: request.height,
          fps: request.fps,
          durationInFrames: request.durationInFrames,
        },
      };
    }
    lastErrors = inspected.errors;
    messages.push({ role: 'assistant', content: code || '(empty response)' });
    messages.push({ role: 'user', content: hyperframesRepairPrompt(inspected.errors) });
  }
  return {
    ok: false,
    attempts: maxRepairs + 1,
    error: 'The model could not produce a composition this host can run.',
    lastErrors,
  };
}

export interface HyperframesLlmSelection {
  readonly configured: boolean;
  /** 'builtin' when the bundled local model is what will run. */
  readonly provider: string;
  readonly model: string;
  readonly providerLabel: string;
  /** True when generation needs no API key and no setup at all. */
  readonly builtin: boolean;
  /** Absolute path of the bundled weights; only set when `builtin` is true. */
  readonly modelPath?: string;
  /**
   * Why nothing is available, when the built-in weights should have been. A
   * code, not a sentence — the copy is UI and lives in the browser so `t()` can
   * translate it.
   */
  readonly problem?: BuiltinLlmProblem;
  readonly maxRepairs: number;
}

/** A vendor is usable when it has a key, is a local runtime, or is OAuth-backed. */
function vendorConfigured(provider: string, apiKey: string): boolean {
  return !!apiKey || isLocalLlmProvider(provider) || provider === 'xai-oauth';
}

/**
 * Which LLM this route would use, in precedence order:
 *
 *   1. Whatever the user configured. An explicit choice always wins — that is
 *      what the setup card is for, and what "use a stronger model" means.
 *   2. The model that ships inside the installer, when its weights are present.
 *   3. Nothing, with a reason the setup card can show.
 *
 * The built-in model is resolved here rather than inside `resolveLlmProviderConfig`
 * on purpose: that function serves every vendor caller in the app, including the
 * browser Agent, which reaches its model through the `/llm` proxy and cannot
 * reach a local llama.cpp process at all. This route is the one place that can
 * actually run the bundled weights, so it is the one place that selects them.
 */
export function resolveHyperframesLlm(
  read: (name: string) => string = (name) => getKey(name as KeyName),
  builtinState: () => BuiltinLlmModelState = () => builtinLlmModelState(),
  runtimeAvailable: () => boolean = builtinLlmRuntimeAvailable,
  downloading: () => boolean = builtinLlmDownloadInFlight,
): HyperframesLlmSelection {
  const provider = normalizeLlmProvider(read('LLM_PROVIDER'));
  const config = resolveLlmProviderConfig(provider, read);
  if (vendorConfigured(provider, config.apiKey)) {
    return {
      configured: true,
      provider,
      model: config.model || defaultModelForProvider(provider),
      providerLabel: llmProviderPreset(provider).label,
      builtin: false,
      maxRepairs: MAX_HYPERFRAMES_REPAIRS,
    };
  }
  const state = builtinState();
  const unconfigured = {
    configured: false as const,
    provider,
    model: config.model || defaultModelForProvider(provider),
    providerLabel: llmProviderPreset(provider).label,
    builtin: false as const,
    maxRepairs: MAX_HYPERFRAMES_REPAIRS,
  };
  if (state.status !== 'ready') {
    return { ...unconfigured, problem: builtinLlmModelProblem(state, downloading()) ?? undefined };
  }
  if (!runtimeAvailable()) {
    return {
      ...unconfigured,
      problem: 'runtime-unavailable',
    };
  }
  return {
    configured: true,
    provider: BUILTIN_LLM_PROVIDER,
    model: state.model.label,
    providerLabel: BUILTIN_LLM_PROVIDER_LABEL,
    builtin: true,
    modelPath: state.path,
    maxRepairs: MAX_BUILTIN_HYPERFRAMES_REPAIRS,
  };
}

export function parseHyperframesRequest(body: Record<string, unknown>): HyperframesRequest | string {
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return 'prompt is required';
  if (prompt.length > MAX_PROMPT_CHARS) return `prompt must be at most ${MAX_PROMPT_CHARS} characters`;
  const positive = (value: unknown, fallback: number): number => (
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : fallback
  );
  const fps = Math.min(120, positive(body.fps, 30));
  const revision = parseHyperframesRevision(body);
  if (typeof revision === 'string') return revision;
  return {
    prompt,
    width: Math.min(7680, positive(body.width, 1920)),
    height: Math.min(7680, positive(body.height, 1080)),
    fps,
    durationInFrames: clampHyperframesDuration(body.durationInFrames, fps * 5),
    ...(revision ? { revision } : {}),
  };
}

/**
 * A revision only exists when there is reference source to revise. The source
 * is trimmed to the context budget HERE as well as in the prompt builder, so a
 * huge reference can never grow the request the model finally sees, whichever
 * caller assembled it.
 */
function parseHyperframesRevision(
  body: Record<string, unknown>,
): HyperframesRevisionContext | undefined | string {
  const referenceCode = typeof body.referenceCode === 'string' ? body.referenceCode.trim() : '';
  if (!referenceCode) return undefined;
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  if (notes.length > MAX_NOTES_CHARS) return `notes must be at most ${MAX_NOTES_CHARS} characters`;
  const referencePrompt = typeof body.referencePrompt === 'string' ? body.referencePrompt.trim() : '';
  return {
    referencePrompt: referencePrompt.slice(0, MAX_PROMPT_CHARS),
    referenceCode: truncateHyperframesReferenceCode(referenceCode, HYPERFRAMES_REFERENCE_CODE_BUDGET),
    notes,
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw new Error('request body too large');
    chunks.push(buffer);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

/** Bind the configured provider to the same in-process `/llm` proxy the agent uses. */
function serverAuthor(selection: HyperframesLlmSelection, origin: string): HyperframesAuthor {
  const model = createServerLanguageModel(
    normalizeLlmProvider(selection.provider),
    selection.model,
    normalizeOpenAiApiMode(getKey('LLM_OPENAI_API_MODE')),
    origin,
  );
  return async ({ system, messages }) => {
    const result = await generateText({
      model,
      system,
      messages: messages.map((message) => ({ role: message.role, content: message.content })),
      maxRetries: 1,
      timeout: GENERATION_TIMEOUT_MS,
    });
    return result.text;
  };
}

// One service per server process, created on the first built-in generation and
// keeping the model loaded across a burst of them. It retires itself after
// idling, so this holding a reference costs nothing between sessions.
let builtinService: BuiltinLlmService | null = null;
let builtinServicePath = '';

function builtinAuthor(selection: HyperframesLlmSelection): HyperframesAuthor {
  const modelPath = selection.modelPath!;
  if (!builtinService || builtinServicePath !== modelPath) {
    builtinService?.dispose();
    const model = builtinLlmModelState().model;
    builtinService = new BuiltinLlmService({
      modelPath,
      contextSize: model.contextSize,
      maxOutputTokens: model.maxOutputTokens,
    });
    builtinServicePath = modelPath;
  }
  const service = builtinService;
  return async ({ system, messages }) => stripReasoningBlocks(
    await service.generate({ system, messages }),
  );
}

/** Release the built-in model. Called when the embedded server shuts down. */
export function disposeBuiltinHyperframesModel(): void {
  builtinService?.dispose();
  builtinService = null;
  builtinServicePath = '';
}

export function hyperframesPlugin(): Plugin {
  return {
    name: 'openchatcut-hyperframes',
    configureServer(server) {
      server.middlewares.use('/api/hyperframes', async (req, res) => {
        try {
          // GET /api/hyperframes/config — does a generation have somewhere to go?
          if (req.method === 'GET') {
            const selection = resolveHyperframesLlm();
            sendJson(res, 200, {
              configured: selection.configured,
              provider: selection.provider,
              providerLabel: selection.providerLabel,
              model: selection.model,
              builtin: selection.builtin,
              ...(selection.problem ? { problem: selection.problem } : {}),
            });
            return;
          }
          if (req.method !== 'POST') {
            sendJson(res, 405, { error: 'method not allowed — use GET or POST' });
            return;
          }
          const selection = resolveHyperframesLlm();
          if (!selection.configured) {
            sendJson(res, 200, {
              configured: false,
              ok: false,
              ...(selection.problem ? { problem: selection.problem } : {}),
            });
            return;
          }
          const parsed = parseHyperframesRequest(await readJsonBody(req));
          if (typeof parsed === 'string') {
            sendJson(res, 400, { error: parsed });
            return;
          }
          // The built-in model runs in this process's own worker, so it needs no
          // proxy origin; a vendor is reached through /llm and does.
          let author: HyperframesAuthor;
          if (selection.builtin) {
            author = builtinAuthor(selection);
          } else {
            const origin = requestOrigin(req);
            if (!origin) {
              sendJson(res, 400, { error: 'valid request host is required' });
              return;
            }
            author = serverAuthor(selection, origin);
          }
          const outcome = await runHyperframesGeneration(parsed, author, selection.maxRepairs);
          sendJson(res, 200, {
            configured: true,
            provider: selection.provider,
            model: selection.model,
            builtin: selection.builtin,
            ...outcome,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          server.config.logger.error(`[hyperframes] ${message}`);
          if (!res.headersSent) sendJson(res, 200, { configured: true, ok: false, error: message });
        }
      });
    },
  };
}
