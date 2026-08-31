// The built-in model's lifecycle, exercised with a fake worker — no model file,
// no llama.cpp, no network. What matters is that the expensive thing is loaded
// lazily, loaded once, given back when the editor goes quiet, and that a worker
// that dies never leaves a request hanging.
import assert from 'node:assert/strict';
import {
  BuiltinLlmService,
  builtinLlmRuntimeAvailable,
  type BuiltinLlmWorker,
} from './service.ts';
import {
  parseBuiltinLlmRequest,
  parseBuiltinLlmResponse,
  stripReasoningBlocks,
} from '../../shared/builtin-llm.ts';

interface FakeWorker extends BuiltinLlmWorker {
  readonly sent: unknown[];
  readonly killed: () => boolean;
  emit(value: unknown): void;
  exit(code: number): void;
}

function fakeWorker(): FakeWorker {
  const sent: unknown[] = [];
  const messageHandlers: Array<(value: unknown) => void> = [];
  const exitHandlers: Array<(code: number) => void> = [];
  let killed = false;
  return {
    sent,
    killed: () => killed,
    postMessage: (value) => { sent.push(value); },
    on: ((event: string, handler: (value: never) => void) => {
      if (event === 'message') messageHandlers.push(handler as (value: unknown) => void);
      else exitHandlers.push(handler as unknown as (code: number) => void);
    }) as BuiltinLlmWorker['on'],
    kill: () => { killed = true; },
    emit: (value) => { for (const handler of [...messageHandlers]) handler(value); },
    exit: (code) => { for (const handler of [...exitHandlers]) handler(code); },
  };
}

const MESSAGES = [{ role: 'user' as const, content: 'draw a bar' }];

function serviceWith(overrides: { idleTimeoutMs?: number } = {}): {
  service: BuiltinLlmService;
  workers: FakeWorker[];
} {
  const workers: FakeWorker[] = [];
  const service = new BuiltinLlmService({
    modelPath: '/models/test.gguf',
    contextSize: 8192,
    maxOutputTokens: 512,
    idleTimeoutMs: overrides.idleTimeoutMs ?? 60_000,
    resolveWorkerPath: () => '/desktop-dist/builtin-llm-worker.mjs',
    createWorker: () => {
      const worker = fakeWorker();
      workers.push(worker);
      return worker;
    },
  });
  return { service, workers };
}

const settle = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

// ── Nothing is loaded until something asks ───────────────────────────────────
{
  const { service, workers } = serviceWith();
  assert.equal(workers.length, 0, 'constructing the service must not fork a worker');
  assert.equal(service.loaded, false);
  service.dispose();
}

// ── First generation: initialize, then generate, on one worker ───────────────
{
  const { service, workers } = serviceWith();
  const first = service.generate({ system: 'be terse', messages: MESSAGES });
  await settle();
  assert.equal(workers.length, 1, 'the first generation forks exactly one worker');
  const worker = workers[0]!;
  const initialize = parseBuiltinLlmRequest(worker.sent[0]);
  assert.equal(initialize?.type, 'initialize');
  assert.equal(initialize?.type === 'initialize' && initialize.modelPath, '/models/test.gguf');
  assert.equal(worker.sent.length, 1, 'nothing is generated before the model reports ready');

  worker.emit({ type: 'ready', gpu: 'metal', loadMs: 600 });
  await settle();
  assert.equal(service.backend, 'metal', 'the service records which backend actually loaded');
  const generate = parseBuiltinLlmRequest(worker.sent[1]);
  assert.equal(generate?.type, 'generate');
  assert.equal(generate?.type === 'generate' && generate.system, 'be terse');
  assert.equal(generate?.type === 'generate' && generate.maxTokens, 512,
    'the catalog output ceiling reaches the worker');

  const requestId = generate?.type === 'generate' ? generate.requestId : '';
  worker.emit({ type: 'result', requestId, text: 'const A = ({ item }) => null;', generateMs: 900 });
  assert.equal(await first, 'const A = ({ item }) => null;');

  // ── A second generation reuses the loaded model ────────────────────────────
  const second = service.generate({ system: 'be terse', messages: MESSAGES });
  await settle();
  assert.equal(workers.length, 1, 'a warm model must not be reloaded');
  const reused = parseBuiltinLlmRequest(worker.sent[2]);
  assert.equal(reused?.type, 'generate');
  worker.emit({
    type: 'result',
    requestId: reused?.type === 'generate' ? reused.requestId : '',
    text: 'second',
    generateMs: 10,
  });
  assert.equal(await second, 'second');
  service.dispose();
  assert.equal(worker.killed(), true, 'disposing must retire the worker');
}

// ── Idle retirement gives the memory back ────────────────────────────────────
{
  const { service, workers } = serviceWith({ idleTimeoutMs: 5 });
  const pending = service.generate({ system: '', messages: MESSAGES });
  await settle();
  const worker = workers[0]!;
  worker.emit({ type: 'ready', gpu: 'cpu', loadMs: 1 });
  await settle();
  const generate = parseBuiltinLlmRequest(worker.sent[1]);
  worker.emit({
    type: 'result',
    requestId: generate?.type === 'generate' ? generate.requestId : '',
    text: 'done',
    generateMs: 1,
  });
  await pending;
  assert.equal(service.loaded, true, 'the model stays loaded immediately after a generation');
  await new Promise((resolve) => { setTimeout(resolve, 30); });
  assert.equal(worker.killed(), true, 'an idle model is unloaded');
  assert.equal(service.loaded, false);

  // ...and the next generation transparently loads it again.
  const later = service.generate({ system: '', messages: MESSAGES });
  await settle();
  assert.equal(workers.length, 2, 'a retired model is re-forked on demand');
  workers[1]!.emit({ type: 'ready', gpu: 'cpu', loadMs: 1 });
  await settle();
  const again = parseBuiltinLlmRequest(workers[1]!.sent[1]);
  workers[1]!.emit({
    type: 'result',
    requestId: again?.type === 'generate' ? again.requestId : '',
    text: 'again',
    generateMs: 1,
  });
  assert.equal(await later, 'again');
  service.dispose();
}

// ── A load failure fails the request instead of hanging it ───────────────────
{
  const { service, workers } = serviceWith();
  const pending = service.generate({ system: '', messages: MESSAGES });
  await settle();
  workers[0]!.emit({ type: 'error', message: 'could not load the model file' });
  await assert.rejects(pending, /could not load the model file/);
  service.dispose();
}

// ── A worker that dies mid-generation rejects, never hangs ───────────────────
{
  const { service, workers } = serviceWith();
  const pending = service.generate({ system: '', messages: MESSAGES });
  await settle();
  workers[0]!.emit({ type: 'ready', gpu: 'cpu', loadMs: 1 });
  await settle();
  workers[0]!.exit(9);
  await assert.rejects(pending, /exited with code 9/);
  service.dispose();
}

// ── A per-request error rejects only that request ────────────────────────────
{
  const { service, workers } = serviceWith();
  const pending = service.generate({ system: '', messages: MESSAGES });
  await settle();
  const worker = workers[0]!;
  worker.emit({ type: 'ready', gpu: 'cpu', loadMs: 1 });
  await settle();
  const generate = parseBuiltinLlmRequest(worker.sent[1]);
  worker.emit({
    type: 'error',
    requestId: generate?.type === 'generate' ? generate.requestId : '',
    message: 'context overflow',
  });
  await assert.rejects(pending, /context overflow/);
  assert.equal(worker.killed(), false, 'one failed generation must not retire a healthy model');
  service.dispose();
}

// ── Garbage from the worker is a failure, never trusted ──────────────────────
{
  const { service, workers } = serviceWith();
  const pending = service.generate({ system: '', messages: MESSAGES });
  await settle();
  workers[0]!.emit({ type: 'ready', gpu: 'cpu', loadMs: 1 });
  await settle();
  workers[0]!.emit({ type: 'result', requestId: 'not a valid id!!', text: 'x', generateMs: 1 });
  await assert.rejects(pending, /invalid message/);
  service.dispose();
}

// ── Wire-protocol validation ─────────────────────────────────────────────────
assert.equal(parseBuiltinLlmResponse(null), null);
assert.equal(parseBuiltinLlmResponse({ type: 'ready' }), null, 'ready must report its backend');
assert.deepEqual(
  parseBuiltinLlmResponse({ type: 'error', message: 'boom' }),
  { type: 'error', message: 'boom' },
  'a load failure legitimately has no request id',
);
assert.equal(parseBuiltinLlmRequest({ type: 'generate', requestId: 'a', system: '', messages: [] }), null,
  'a generation must carry at least one message');
assert.equal(
  parseBuiltinLlmRequest({
    type: 'generate', requestId: 'a', system: '', messages: [{ role: 'system', content: 'x' }],
  }),
  null,
  'only user and assistant turns cross the boundary; the system prompt is its own field',
);
assert.equal(parseBuiltinLlmRequest({ type: 'initialize', modelPath: '', contextSize: 10 }), null);

// ── Reasoning blocks never reach the composition linter ──────────────────────
assert.equal(
  stripReasoningBlocks('<think>let me plan</think>\nconst A = ({ item }) => null;'),
  'const A = ({ item }) => null;',
);
assert.equal(
  stripReasoningBlocks('plan text</think>\nconst A = ({ item }) => null;'),
  'const A = ({ item }) => null;',
  'a generation that began mid-thought still yields its answer',
);
assert.equal(stripReasoningBlocks('const A = ({ item }) => null;'), 'const A = ({ item }) => null;');

// ── Runtime detection ────────────────────────────────────────────────────────
assert.equal(builtinLlmRuntimeAvailable(() => '/x/node-llama-cpp/index.js'), true);
assert.equal(
  builtinLlmRuntimeAvailable(() => { throw new Error('MODULE_NOT_FOUND'); }),
  false,
  'a build without the native runtime must report unavailable rather than throw',
);

console.log('builtin-llm/service.verify: lazy load, reuse, idle unload, failure paths and wire protocol OK');
