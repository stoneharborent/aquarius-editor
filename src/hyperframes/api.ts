// Browser side of the HyperFrames routes. Keys never travel back from the
// server: the setup card reads booleans from /api/keys and writes values to it,
// and generation itself only ever sees composition source.
import { LLM_PROVIDER_PRESETS, llmProviderConfigNames, type LlmProvider } from '../../shared/llm-providers';

/**
 * Codes `server/builtin-llm/model-file.ts` reports for weights it cannot use.
 * `model-downloading` is the hopeful one: they are on their way.
 */
export type HyperframesProblem =
  | 'model-missing'
  | 'model-downloading'
  | 'model-corrupt'
  | 'runtime-unavailable';

const PROBLEMS: readonly string[] = [
  'model-missing', 'model-downloading', 'model-corrupt', 'runtime-unavailable',
];

function problemOf(value: unknown): HyperframesProblem | undefined {
  return typeof value === 'string' && PROBLEMS.includes(value) ? value as HyperframesProblem : undefined;
}

export interface HyperframesConfigStatus {
  configured: boolean;
  provider: string;
  providerLabel: string;
  model: string;
  /** True when generation is running on the model that ships inside the app. */
  builtin: boolean;
  /**
   * Why nothing is available, when the bundled weights should have been. Set
   * only alongside `configured: false` — a user who deleted the model file, or
   * a build without the local runtime, gets told, never left with a dead button.
   */
  problem?: HyperframesProblem;
}

/**
 * May the user type a brief and press Generate?
 *
 * Yes when a model is ready — and also while the built-in one is downloading.
 * The alternative is a prompt bar that is dead for the several minutes a 2.3 GB
 * transfer takes, which reads as a broken tab rather than a busy one. The
 * attempt comes back with one sentence saying the model is still on its way,
 * which is a better answer than an input that will not accept typing and never
 * says why. It deliberately does NOT queue: the transfer takes minutes, and a
 * brief held that long is one its author has moved on from.
 */
export function hyperframesAcceptsPrompts(
  config: Pick<HyperframesConfigStatus, 'configured' | 'problem'> | null,
): boolean {
  if (!config) return true;
  return config.configured || config.problem === 'model-downloading';
}

export interface HyperframesGenerationRequest {
  prompt: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  /**
   * A revision: the brief and the composition source of the generation being
   * revised, plus what the user wants changed. All three travel together —
   * the server ignores the other two without `referenceCode`.
   */
  referencePrompt?: string;
  referenceCode?: string;
  notes?: string;
}

export interface HyperframesGenerationResult {
  ok: boolean;
  configured: boolean;
  code?: string;
  durationInFrames?: number;
  width?: number;
  height?: number;
  error?: string;
  /** Set when the server refused because the bundled weights went missing. */
  problem?: HyperframesProblem;
}

export async function fetchHyperframesConfig(): Promise<HyperframesConfigStatus> {
  try {
    const response = await fetch('/api/hyperframes', { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json() as Partial<HyperframesConfigStatus>;
    return {
      configured: body.configured === true,
      provider: typeof body.provider === 'string' ? body.provider : '',
      providerLabel: typeof body.providerLabel === 'string' ? body.providerLabel : '',
      model: typeof body.model === 'string' ? body.model : '',
      builtin: body.builtin === true,
      ...(problemOf(body.problem) ? { problem: problemOf(body.problem) } : {}),
    };
  } catch {
    return { configured: false, provider: '', providerLabel: '', model: '', builtin: false };
  }
}

export async function generateHyperframe(
  request: HyperframesGenerationRequest,
): Promise<HyperframesGenerationResult> {
  let body: Record<string, unknown>;
  try {
    const response = await fetch('/api/hyperframes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    body = await response.json() as Record<string, unknown>;
    if (!response.ok && typeof body.error !== 'string') {
      return { ok: false, configured: true, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    return { ok: false, configured: true, error: error instanceof Error ? error.message : String(error) };
  }
  if (body.configured === false) {
    return {
      ok: false,
      configured: false,
      ...(problemOf(body.problem) ? { problem: problemOf(body.problem) } : {}),
    };
  }
  const composition = body.composition as Record<string, unknown> | undefined;
  if (body.ok === true && composition && typeof composition.code === 'string') {
    return {
      ok: true,
      configured: true,
      code: composition.code,
      durationInFrames: typeof composition.durationInFrames === 'number' ? composition.durationInFrames : undefined,
      width: typeof composition.width === 'number' ? composition.width : undefined,
      height: typeof composition.height === 'number' ? composition.height : undefined,
    };
  }
  return {
    ok: false,
    configured: true,
    error: typeof body.error === 'string' ? body.error : 'Generation failed',
  };
}

/**
 * Providers offered by the inline setup card, local runtimes included. The
 * built-in model is deliberately absent: it is the state you are already in
 * when the card offers itself as an upgrade, so listing it would be an option
 * that changes nothing.
 */
export const HYPERFRAMES_PROVIDER_OPTIONS = LLM_PROVIDER_PRESETS
  .filter((preset) => preset.id !== 'xai-oauth')
  .map((preset) => ({ id: preset.id as LlmProvider, label: preset.label }));

/** Save the provider choice (and key, when the provider needs one) through /api/keys. */
export async function saveHyperframesProvider(provider: LlmProvider, apiKey: string): Promise<void> {
  const names = llmProviderConfigNames(provider);
  const patch: Record<string, string> = { LLM_PROVIDER: provider };
  if (apiKey.trim()) patch[names.apiKey] = apiKey.trim();
  const response = await fetch('/api/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `HTTP ${response.status}`);
  }
}
