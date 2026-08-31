// The one shape the built-in-model download speaks in, shared by the server
// route and the card that renders it.
//
// Why this exists at all: the weights cannot ship inside the installer — GitHub
// refuses a release asset of 2 GiB or more and the GGUF is 2.33 GiB — so the app
// fetches them itself, once, in the background, from the same pinned catalog
// entry the build-time fetch would have used. Everything the user sees about
// that (a percentage, a pause button, a decline that sticks) is driven by the
// snapshot below.

/**
 * Where the built-in model is in its life.
 *
 *   absent      — not here, nothing running. Either nobody has asked yet, or the
 *                 user declined; `declined` says which.
 *   downloading — bytes are moving. `bytesDone` / `bytesTotal` are real.
 *   paused      — a transfer was stopped with bytes on disk. Resuming continues
 *                 from `bytesDone` rather than starting again.
 *   ready       — the verified weights are in the model cache; generation works.
 *   error       — the last attempt failed. `error` says why; retrying is safe,
 *                 and a checksum failure has already discarded the bad file.
 */
export type BuiltinLlmDownloadStatus =
  | 'absent'
  | 'downloading'
  | 'paused'
  | 'ready'
  | 'error';

export interface BuiltinLlmDownloadState {
  readonly status: BuiltinLlmDownloadStatus;
  readonly bytesDone: number;
  readonly bytesTotal: number;
  /** Model label, so the card can name what it is fetching. */
  readonly label: string;
  /** True once the user has said no; the app then never starts one by itself. */
  readonly declined: boolean;
  /**
   * True when this runtime is allowed to start the download on its own — the
   * packaged desktop app, or a dev server with the opt-in env flag. A browser
   * dev session without it shows the offer but waits to be asked.
   */
  readonly autoStart: boolean;
  /** Whether a local llama.cpp runtime exists to run the weights at all. */
  readonly runtimeAvailable: boolean;
  readonly error?: string;
}

/** 0–100, rounded, and never ahead of itself. Total 0 reads as 0, not NaN. */
export function builtinLlmDownloadPercent(state: {
  readonly bytesDone: number;
  readonly bytesTotal: number;
}): number {
  if (!(state.bytesTotal > 0)) return 0;
  const ratio = state.bytesDone / state.bytesTotal;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

/**
 * The size as a person reads it: "2.3 GB". Decimal GB on purpose — that is what
 * a download manager, a browser and every ISP say, and the card is telling
 * someone how much of their connection this will use, not how much disk a
 * kernel will report.
 */
export function formatDownloadSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1_000_000)} MB`;
}
