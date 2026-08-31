// The process that actually holds the built-in language model.
//
// Same shape as the other native workers (`native-asr-worker`,
// `native-semantic-worker`, …): a message-per-request loop with no state beyond
// the loaded model. Inference is llama.cpp through node-llama-cpp, which selects
// Metal on macOS and CUDA/Vulkan/CPU elsewhere from its own prebuilt binary —
// the app never compiles anything.
//
// Why a separate process at all: a 2.3 GiB model plus its KV cache is resident
// RAM, and a generation is a long native call. Keeping both out of the process
// that serves the editor means the window never stutters, and the whole
// allocation disappears when the service retires the worker after idling.
//
// Unlike the other workers this one is also forked as a plain child process:
// the HyperFrames route runs in the Vite dev server under `npm run dev`, where
// there is no Electron and therefore no `process.parentPort`. The two channels
// differ only in how a message is sent and unwrapped, which is the fork below
// and nothing else.
import {
  parseBuiltinLlmRequest,
  type BuiltinLlmGenerateRequest,
  type BuiltinLlmResponse,
} from '../shared/builtin-llm.ts';

interface UtilityPort {
  postMessage(value: unknown): void;
  on(event: 'message', handler: (event: { data: unknown }) => void): void;
}

const utilityPort = (process as unknown as { parentPort?: UtilityPort }).parentPort;

function send(message: BuiltinLlmResponse): void {
  if (utilityPort) utilityPort.postMessage(message);
  else process.send?.(message);
}

interface LoadedModel {
  readonly generate: (request: BuiltinLlmGenerateRequest) => Promise<string>;
}

let loading: Promise<LoadedModel> | null = null;
/** Serializes generations: one llama.cpp context at a time, in arrival order. */
let queue: Promise<void> = Promise.resolve();

async function loadModel(modelPath: string, contextSize: number): Promise<LoadedModel> {
  const started = Date.now();
  // Imported lazily so a platform without the prebuilt binary still starts and
  // reports a clean failure instead of dying at module evaluation.
  const { getLlama, LlamaChatSession } = await import('node-llama-cpp');
  const llama = await getLlama();
  const model = await llama.loadModel({ modelPath });
  send({ type: 'ready', gpu: String(llama.gpu ?? 'cpu'), loadMs: Date.now() - started });

  return {
    generate: async (request) => {
      // A context per request: the composition conversation is short-lived, and
      // a fresh KV cache is what guarantees one generation can never read
      // another's tokens. The model itself — the expensive part — stays loaded.
      const context = await model.createContext({ contextSize });
      try {
        const session = new LlamaChatSession({
          contextSequence: context.getSequence(),
          systemPrompt: request.system,
        });
        const history = session.getChatHistory();
        for (const message of request.messages.slice(0, -1)) {
          if (message.role === 'user') history.push({ type: 'user', text: message.content });
          else history.push({ type: 'model', response: [message.content] });
        }
        session.setChatHistory(history);
        return await session.prompt(request.messages.at(-1)!.content, {
          maxTokens: request.maxTokens,
          temperature: request.temperature,
          topP: 0.9,
        });
      } finally {
        await context.dispose();
      }
    },
  };
}

function fail(cause: unknown, requestId?: string): void {
  const message = cause instanceof Error ? cause.message : String(cause);
  send(requestId ? { type: 'error', requestId, message } : { type: 'error', message });
}

async function handle(value: unknown): Promise<void> {
  const request = parseBuiltinLlmRequest(value);
  if (!request) {
    fail('the built-in LLM worker received an invalid message');
    return;
  }
  if (request.type === 'initialize') {
    loading ??= loadModel(request.modelPath, request.contextSize);
    try {
      await loading;
    } catch (error) {
      loading = null;
      fail(error);
    }
    return;
  }
  const pending = loading;
  if (!pending) {
    fail('the built-in LLM worker was asked to generate before it was initialized', request.requestId);
    return;
  }
  queue = queue.then(async () => {
    try {
      const model = await pending;
      const started = Date.now();
      const text = await model.generate(request);
      send({ type: 'result', requestId: request.requestId, text, generateMs: Date.now() - started });
    } catch (error) {
      fail(error, request.requestId);
    }
  });
  await queue;
}

if (utilityPort) utilityPort.on('message', (event) => { void handle(event.data); });
else process.on('message', (value: unknown) => { void handle(value); });
