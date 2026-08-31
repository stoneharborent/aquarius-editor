// Browser side of /api/builtin-llm — the built-in graphics model's one-time
// download. Reads are a plain GET; the three mutations are POSTs the server
// gates on the editor credential, same as the model-pack ones.
import type { BuiltinLlmDownloadState, BuiltinLlmDownloadStatus } from '../../shared/builtin-llm-download';

const STATUSES: readonly string[] = ['absent', 'downloading', 'paused', 'ready', 'error'];

function statusOf(value: unknown): BuiltinLlmDownloadStatus {
  return typeof value === 'string' && STATUSES.includes(value)
    ? value as BuiltinLlmDownloadStatus
    : 'absent';
}

function positive(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function parseState(body: Partial<BuiltinLlmDownloadState>): BuiltinLlmDownloadState {
  return {
    status: statusOf(body.status),
    bytesDone: positive(body.bytesDone),
    bytesTotal: positive(body.bytesTotal),
    label: typeof body.label === 'string' ? body.label : '',
    declined: body.declined === true,
    autoStart: body.autoStart === true,
    runtimeAvailable: body.runtimeAvailable === true,
    ...(typeof body.error === 'string' && body.error ? { error: body.error } : {}),
  };
}

/**
 * Never throws. A card that cannot reach the server should look like a card with
 * nothing to download, not a red box — the provider option beside it still
 * works, which is the whole point of showing both.
 */
export async function fetchBuiltinLlmState(): Promise<BuiltinLlmDownloadState | null> {
  try {
    const response = await fetch('/api/builtin-llm', { method: 'GET' });
    if (!response.ok) return null;
    return parseState(await response.json() as Partial<BuiltinLlmDownloadState>);
  } catch {
    return null;
  }
}

async function mutate(action: 'download' | 'pause' | 'decline'): Promise<BuiltinLlmDownloadState | null> {
  try {
    const response = await fetch(`/api/builtin-llm/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) return null;
    return parseState(await response.json() as Partial<BuiltinLlmDownloadState>);
  } catch {
    return null;
  }
}

/** Start, or resume a paused transfer from where it stopped. */
export const startBuiltinLlmDownload = (): Promise<BuiltinLlmDownloadState | null> => mutate('download');
/** Stop, keeping the bytes already on disk. */
export const pauseBuiltinLlmDownload = (): Promise<BuiltinLlmDownloadState | null> => mutate('pause');
/** Stop, and remember not to offer it again by itself. */
export const declineBuiltinLlmDownload = (): Promise<BuiltinLlmDownloadState | null> => mutate('decline');

/** How often the card re-reads a running download. Fast enough to feel live. */
export const BUILTIN_LLM_POLL_MS = 1_000;
