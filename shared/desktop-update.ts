export const DESKTOP_UPDATE_CHANNELS = {
  state: 'openchatcut:update-state',
  getState: 'openchatcut:update-get-state',
  check: 'openchatcut:update-check',
  download: 'openchatcut:update-download',
  install: 'openchatcut:update-install',
} as const;

export type DesktopUpdateCheckSource = 'auto' | 'manual';
export type DesktopUpdateOperation = 'check' | 'download' | 'install';

/**
 * Why an update operation failed, to the extent it is honestly knowable.
 *
 * The point is a message the user can act on. "Unable to check for updates" on its own sent
 * Royce's AquariusOS handheld into a loop of pressing the same button, because nothing told
 * him whether the machine was offline, the release server was down, or the app itself was
 * broken (it was the app — see the overlay note in desktop/update-service.ts).
 *
 * - `offline`      the request never got an answer: no network, DNS failure, timeout, or
 *                  something in between blocking it. A browser cannot tell these apart, so
 *                  the copy must not claim to either.
 * - `rate-limited` GitHub answered 403/429. Unauthenticated API calls are capped per IP.
 * - `unavailable`  the release server answered, but with an error (5xx, 404, anything else).
 * - `unreadable`   a successful response that did not describe a release we can use.
 * - `unknown`      genuinely unclassified. Do not reach for this to avoid choosing.
 */
export type DesktopUpdateFailureReason =
  | 'offline'
  | 'rate-limited'
  | 'unavailable'
  | 'unreadable'
  | 'unknown';

const FAILURE_REASONS = new Set<DesktopUpdateFailureReason>([
  'offline',
  'rate-limited',
  'unavailable',
  'unreadable',
  'unknown',
]);

export function isDesktopUpdateFailureReason(value: unknown): value is DesktopUpdateFailureReason {
  return typeof value === 'string' && FAILURE_REASONS.has(value as DesktopUpdateFailureReason);
}

/** Maps an HTTP status from the release feed onto the reason the user is shown. */
export function failureReasonForStatus(status: number): DesktopUpdateFailureReason {
  if (status === 403 || status === 429) return 'rate-limited';
  return 'unavailable';
}

/**
 * Classifies a thrown check failure.
 *
 * `fetch` rejects with a TypeError for every transport-level problem — offline, DNS,
 * connection reset, and a Content-Security-Policy refusal all look identical from inside
 * the page — so they all land on `offline`, whose copy names both possibilities.
 */
export function failureReasonForError(error: unknown): DesktopUpdateFailureReason {
  const tagged = (error as { reason?: unknown } | null | undefined)?.reason;
  if (isDesktopUpdateFailureReason(tagged)) return tagged;
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) return 'offline';
  if (error instanceof TypeError) return 'offline';
  return 'unknown';
}

/** An Error that carries the reason the UI should report. */
export function updateCheckError(
  message: string,
  reason: DesktopUpdateFailureReason,
): Error & { reason: DesktopUpdateFailureReason } {
  return Object.assign(new Error(message), { reason });
}

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/i;

export interface ParsedReleaseVersion {
  readonly core: readonly [number, number, number];
  readonly prerelease: readonly string[];
}

/**
 * The one semver parser for the whole update path.
 *
 * The renderer's GitHub-API check and the main process's overlay check compare the same
 * feed against the same installed build; two implementations could disagree about a
 * prerelease and offer, or withhold, an update on one side only.
 */
export function parseReleaseVersion(version: string): ParsedReleaseVersion | null {
  const match = version.trim().match(SEMVER);
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split('.') ?? [],
  };
}

function comparePrerelease(candidate: readonly string[], current: readonly string[]): number {
  if (candidate.length === 0 || current.length === 0) {
    return candidate.length === current.length ? 0 : candidate.length === 0 ? 1 : -1;
  }
  const length = Math.max(candidate.length, current.length);
  for (let index = 0; index < length; index += 1) {
    const next = candidate[index];
    const installed = current[index];
    if (next === undefined || installed === undefined) return next === installed ? 0 : next === undefined ? -1 : 1;
    if (next === installed) continue;
    const nextNumber = /^\d+$/.test(next) ? Number(next) : null;
    const installedNumber = /^\d+$/.test(installed) ? Number(installed) : null;
    if (nextNumber !== null || installedNumber !== null) {
      if (nextNumber === null) return 1;
      if (installedNumber === null) return -1;
      return nextNumber > installedNumber ? 1 : -1;
    }
    return next > installed ? 1 : -1;
  }
  return 0;
}

/** Throws when either side is not a release version — never silently reports "no update". */
export function isNewerReleaseVersion(candidate: string, current: string): boolean {
  const next = parseReleaseVersion(candidate);
  const installed = parseReleaseVersion(current);
  if (!next || !installed) {
    throw updateCheckError('Upstream did not return a valid release version', 'unreadable');
  }
  for (let index = 0; index < next.core.length; index += 1) {
    if (next.core[index] !== installed.core[index]) return next.core[index]! > installed.core[index]!;
  }
  return comparePrerelease(next.prerelease, installed.prerelease) > 0;
}
export type DesktopUpdatePhase =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'available'
  | 'current'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

export interface DesktopUpdateState {
  readonly phase: DesktopUpdatePhase;
  readonly source: DesktopUpdateCheckSource;
  readonly currentVersion: string;
  readonly latestVersion?: string;
  readonly percent?: number;
  readonly failedOperation?: DesktopUpdateOperation;
  /** Set with `failedOperation` so the renderer can explain the failure, not just report it. */
  readonly failureReason?: DesktopUpdateFailureReason;
}

const UPDATE_PHASES = new Set<DesktopUpdatePhase>([
  'unsupported',
  'idle',
  'checking',
  'available',
  'current',
  'downloading',
  'downloaded',
  'installing',
  'error',
]);

export function isDesktopUpdateCheckSource(value: unknown): value is DesktopUpdateCheckSource {
  return value === 'auto' || value === 'manual';
}

export function isDesktopUpdateState(value: unknown): value is DesktopUpdateState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DesktopUpdateState>;
  if (!candidate.phase || !UPDATE_PHASES.has(candidate.phase)) return false;
  if (!isDesktopUpdateCheckSource(candidate.source)) return false;
  if (typeof candidate.currentVersion !== 'string' || !candidate.currentVersion.trim()) return false;
  if (candidate.latestVersion !== undefined && typeof candidate.latestVersion !== 'string') return false;
  if (candidate.percent !== undefined
    && (typeof candidate.percent !== 'number' || !Number.isFinite(candidate.percent))) return false;
  if (candidate.failedOperation !== undefined
    && !['check', 'download', 'install'].includes(candidate.failedOperation)) return false;
  if (candidate.failureReason !== undefined
    && !isDesktopUpdateFailureReason(candidate.failureReason)) return false;
  return true;
}
