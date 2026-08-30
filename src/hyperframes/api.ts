// Browser side of the HyperFrames routes. Keys never travel back from the
// server: the setup card reads booleans from /api/keys and writes values to it,
// and generation itself only ever sees composition source.
import { LLM_PROVIDER_PRESETS, llmProviderConfigNames, type LlmProvider } from '../../shared/llm-providers';

export interface HyperframesConfigStatus {
  configured: boolean;
  provider: string;
  providerLabel: string;
  model: string;
}

export interface HyperframesGenerationRequest {
  prompt: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
}

export interface HyperframesGenerationResult {
  ok: boolean;
  configured: boolean;
  code?: string;
  durationInFrames?: number;
  width?: number;
  height?: number;
  error?: string;
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
    };
  } catch {
    return { configured: false, provider: '', providerLabel: '', model: '' };
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
  if (body.configured === false) return { ok: false, configured: false };
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

/** Providers offered by the inline setup card, local runtimes included. */
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
