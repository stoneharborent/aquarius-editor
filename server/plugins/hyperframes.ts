// HyperFrames generation: prompt in → one host-contract composition out.
//
// The route reuses the existing LLM plumbing verbatim — the same keystore
// configuration the agent runs read, the same provider SDK factory, and the same
// local `/llm` proxy that injects the real key server-side. Nothing about the
// removed chat UI is resurrected; this is one stateless POST.
//
// The generated source is linted against `shared/hyperframes-contract.ts` before
// it is returned, and a failing draft is sent back to the model with its own
// errors up to MAX_REPAIRS times. A composition that leaves this route is one the
// browser's template host can compile.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { generateText } from 'ai';
import { getKey, type KeyName } from '../keystore.ts';
import {
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
  hyperframesRepairPrompt,
  hyperframesSystemPrompt,
  hyperframesUserPrompt,
} from '../../shared/hyperframes-prompt.ts';

/** Two repairs after the first attempt — three model calls at the very worst. */
export const MAX_HYPERFRAMES_REPAIRS = 2;
const MAX_PROMPT_CHARS = 4000;
const MAX_BODY_BYTES = 64 * 1024;
const GENERATION_TIMEOUT_MS = 180_000;

export interface HyperframesRequest {
  readonly prompt: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationInFrames: number;
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
 * The generation loop, with the model call injected so it can be exercised
 * without a network. Draft → lint → (repair with the lint errors) → accept.
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
    const lint = lintHyperframesComposition(code);
    if (lint.ok) {
      return {
        ok: true,
        attempts: attempt,
        composition: {
          code,
          componentName: lint.name,
          width: request.width,
          height: request.height,
          fps: request.fps,
          durationInFrames: request.durationInFrames,
        },
      };
    }
    lastErrors = lint.errors;
    messages.push({ role: 'assistant', content: code || '(empty response)' });
    messages.push({ role: 'user', content: hyperframesRepairPrompt(lint.errors) });
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
  readonly provider: string;
  readonly model: string;
  readonly providerLabel: string;
}

/**
 * Which LLM this route would use. A local provider (Ollama / LM Studio) counts
 * as configured without a key — that is the whole point of running one.
 */
export function resolveHyperframesLlm(
  read: (name: string) => string = (name) => getKey(name as KeyName),
): HyperframesLlmSelection {
  const provider = normalizeLlmProvider(read('LLM_PROVIDER'));
  const config = resolveLlmProviderConfig(provider, read);
  return {
    configured: !!config.apiKey || isLocalLlmProvider(provider) || provider === 'xai-oauth',
    provider,
    model: config.model || defaultModelForProvider(provider),
    providerLabel: llmProviderPreset(provider).label,
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
  return {
    prompt,
    width: Math.min(7680, positive(body.width, 1920)),
    height: Math.min(7680, positive(body.height, 1080)),
    fps,
    durationInFrames: clampHyperframesDuration(body.durationInFrames, fps * 5),
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
            });
            return;
          }
          if (req.method !== 'POST') {
            sendJson(res, 405, { error: 'method not allowed — use GET or POST' });
            return;
          }
          const selection = resolveHyperframesLlm();
          if (!selection.configured) {
            sendJson(res, 200, { configured: false, ok: false });
            return;
          }
          const origin = requestOrigin(req);
          if (!origin) {
            sendJson(res, 400, { error: 'valid request host is required' });
            return;
          }
          const parsed = parseHyperframesRequest(await readJsonBody(req));
          if (typeof parsed === 'string') {
            sendJson(res, 400, { error: parsed });
            return;
          }
          const outcome = await runHyperframesGeneration(parsed, serverAuthor(selection, origin));
          sendJson(res, 200, {
            configured: true,
            provider: selection.provider,
            model: selection.model,
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
