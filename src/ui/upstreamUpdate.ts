import type {
  DesktopUpdateFailureReason,
  DesktopUpdateOperation,
  DesktopUpdateState,
} from '../../shared/desktop-update';
import {
  failureReasonForError,
  failureReasonForStatus,
  isNewerReleaseVersion,
  parseReleaseVersion,
  updateCheckError,
} from '../../shared/desktop-update';

/**
 * Where Aquarius Editor looks for its own releases.
 *
 * This is the fork's own repository and must stay that way: upstream pointed it at
 * 0xsline/OpenChatCut, and offering that project's releases here would hand users a
 * different app on a different version line. Three siblings switch the same feature on
 * and must agree with this one — `publish` in config/electron-builder.config.mjs,
 * DESKTOP_UPDATE_FEED_CONFIGURED in desktop/update-service.ts, and the update-metadata
 * artifacts in .github/workflows/desktop.yml.
 */
export const RELEASE_FEED: { readonly latestReleaseApiUrl: string; readonly releasesPageUrl: string } | null = {
  latestReleaseApiUrl: 'https://api.github.com/repos/stoneharborent/aquarius-editor/releases/latest',
  releasesPageUrl: 'https://github.com/stoneharborent/aquarius-editor/releases/latest',
};

export const UPDATE_CHECKS_ENABLED = RELEASE_FEED !== null;

export const CURRENT_APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type CheckSource = 'auto' | 'manual';

type DesktopUpdateApi = NonNullable<Window['openChatCutDesktop']>['updates'];
export interface UpstreamReleaseResult {
  latestVersion: string;
  updateAvailable: boolean;
}

interface VersionedUpdateState {
  visible: boolean;
  source: CheckSource;
  currentVersion: string;
  latestVersion: string;
}

export type UpstreamUpdateState =
  | { phase: 'idle'; visible: false }
  | { phase: 'checking'; visible: false; source: CheckSource }
  | (VersionedUpdateState & { phase: 'available' | 'current' })
  | (VersionedUpdateState & { phase: 'downloading'; percent: number })
  | (VersionedUpdateState & { phase: 'downloaded' | 'installing' })
  | {
    phase: 'error';
    visible: boolean;
    source: CheckSource;
    currentVersion: string;
    latestVersion?: string;
    failedOperation: DesktopUpdateOperation;
    failureReason: DesktopUpdateFailureReason;
  };

const listeners = new Set<() => void>();
let state: UpstreamUpdateState = { phase: 'idle', visible: false };
let requestSequence = 0;
let autoCheckStarted = false;
let activeController: AbortController | null = null;
let unsubscribeDesktopUpdates: (() => void) | null = null;
let desktopStateRevision = 0;
let desktopUpdateSupported: boolean | null = null;

export function formatDisplayVersion(version: string): string {
  return `V${version.trim().replace(/^v/i, '')}`;
}

export async function queryLatestUpstreamRelease(
  currentVersion: string,
  fetcher: Fetcher = fetch,
  signal?: AbortSignal,
  latestReleaseApiUrl: string | undefined = RELEASE_FEED?.latestReleaseApiUrl,
): Promise<UpstreamReleaseResult> {
  if (!latestReleaseApiUrl) throw new Error('No release feed is configured');
  const response = await fetcher(latestReleaseApiUrl, { signal });
  if (!response.ok) {
    throw updateCheckError(
      `Upstream release check failed (${response.status})`,
      failureReasonForStatus(response.status),
    );
  }
  const payload = await response.json().catch(() => {
    throw updateCheckError('The release feed was not readable', 'unreadable');
  }) as { tag_name?: unknown };
  if (typeof payload.tag_name !== 'string' || !parseReleaseVersion(payload.tag_name)) {
    throw updateCheckError('Upstream did not return a valid release version', 'unreadable');
  }
  return {
    latestVersion: payload.tag_name,
    updateAvailable: isNewerReleaseVersion(payload.tag_name, currentVersion),
  };
}

function publish(next: UpstreamUpdateState): void {
  state = next;
  listeners.forEach((notify) => { notify(); });
}

export function mapDesktopUpdateState(update: DesktopUpdateState): UpstreamUpdateState {
  const latestVersion = update.latestVersion ?? update.currentVersion;
  if (update.phase === 'unsupported' || update.phase === 'idle') {
    return { phase: 'idle', visible: false };
  }
  if (update.phase === 'checking') {
    return { phase: 'checking', visible: false, source: update.source };
  }
  if (update.phase === 'error') {
    return {
      phase: 'error',
      visible: update.source === 'manual',
      source: update.source,
      currentVersion: update.currentVersion,
      latestVersion: update.latestVersion,
      failedOperation: update.failedOperation ?? 'check',
      failureReason: update.failureReason ?? 'unknown',
    };
  }
  const versioned = {
    source: update.source,
    currentVersion: update.currentVersion,
    latestVersion,
  };
  if (update.phase === 'available') return { ...versioned, phase: 'available', visible: true };
  if (update.phase === 'current') {
    return { ...versioned, phase: 'current', visible: update.source === 'manual' };
  }
  if (update.phase === 'downloading') {
    return { ...versioned, phase: 'downloading', visible: true, percent: Math.max(0, Math.min(100, update.percent ?? 0)) };
  }
  if (update.phase === 'downloaded') return { ...versioned, phase: 'downloaded', visible: true };
  return { ...versioned, phase: 'installing', visible: true };
}

function desktopUpdateApi(): DesktopUpdateApi | null {
  if (typeof window === 'undefined') return null;
  return window.openChatCutDesktop?.updates ?? null;
}

function syncDesktopUpdate(update: DesktopUpdateState): void {
  desktopUpdateSupported = update.phase !== 'unsupported';
  desktopStateRevision += 1;
  publish(mapDesktopUpdateState(update));
}

function ensureDesktopUpdateSubscription(): DesktopUpdateApi | null {
  if (!UPDATE_CHECKS_ENABLED) return null;
  const desktop = desktopUpdateApi();
  if (!desktop || unsubscribeDesktopUpdates) return desktop;
  unsubscribeDesktopUpdates = desktop.subscribe(syncDesktopUpdate);
  const revision = desktopStateRevision;
  void desktop.getState().then((update) => {
    if (desktopStateRevision === revision) syncDesktopUpdate(update);
  }).catch(() => undefined);
  return desktop;
}

export function hasDesktopUpdateSupport(): boolean {
  if (!UPDATE_CHECKS_ENABLED) return false;
  return desktopUpdateApi() !== null && desktopUpdateSupported !== false;
}

export function subscribeUpstreamUpdate(notify: () => void): () => void {
  listeners.add(notify);
  ensureDesktopUpdateSubscription();
  return () => { listeners.delete(notify); };
}

export function getUpstreamUpdateState(): UpstreamUpdateState {
  return state;
}

export function dismissUpstreamUpdate(): void {
  requestSequence += 1;
  activeController?.abort();
  activeController = null;
  if (state.phase === 'idle') return;
  if (state.phase === 'checking') {
    publish({ phase: 'idle', visible: false });
    return;
  }
  publish({ ...state, visible: false });
}

async function requestWebUpdateCheck(source: CheckSource): Promise<void> {
  const sequence = ++requestSequence;
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  publish({ phase: 'checking', source, visible: false });
  const timeout = globalThis.setTimeout(() => controller.abort(), 6_000);

  try {
    const result = await queryLatestUpstreamRelease(CURRENT_APP_VERSION, fetch, controller.signal);
    if (sequence !== requestSequence) return;
    publish({
      phase: result.updateAvailable ? 'available' : 'current',
      source,
      visible: result.updateAvailable || source === 'manual',
      currentVersion: CURRENT_APP_VERSION,
      latestVersion: result.latestVersion,
    });
  } catch (error) {
    if (sequence === requestSequence) {
      publish({
        phase: 'error',
        source,
        visible: source === 'manual',
        currentVersion: CURRENT_APP_VERSION,
        failedOperation: 'check',
        // An abort here is this function's own 6s timeout firing, which is a slow or
        // absent network from the user's point of view — the same story as offline.
        failureReason: failureReasonForError(error),
      });
    }
  } finally {
    globalThis.clearTimeout(timeout);
    if (sequence === requestSequence) activeController = null;
  }
}

export async function requestUpstreamUpdateCheck(source: CheckSource = 'manual'): Promise<void> {
  // Should RELEASE_FEED ever be cleared again, there is nothing to check and no one to contact.
  if (!UPDATE_CHECKS_ENABLED) {
    publish({ phase: 'idle', visible: false });
    return;
  }
  const desktop = hasDesktopUpdateSupport() ? ensureDesktopUpdateSubscription() : null;
  if (!desktop) return requestWebUpdateCheck(source);

  publish({ phase: 'checking', source, visible: false });
  try {
    const update = await desktop.check(source);
    syncDesktopUpdate(update);
    if (update.phase === 'unsupported') await requestWebUpdateCheck(source);
  } catch (error) {
    // The desktop check reports its own failures through the state it returns; reaching here
    // means the IPC call itself broke, which is the app's fault rather than the network's.
    publish({
      phase: 'error',
      source,
      visible: source === 'manual',
      currentVersion: CURRENT_APP_VERSION,
      failedOperation: 'check',
      failureReason: failureReasonForError(error),
    });
  }
}

export async function requestUpstreamUpdateDownload(): Promise<void> {
  if (!UPDATE_CHECKS_ENABLED) return;
  const desktop = hasDesktopUpdateSupport() ? ensureDesktopUpdateSubscription() : null;
  if (!desktop) {
    openUpstreamReleasePage();
    return;
  }
  try {
    syncDesktopUpdate(await desktop.download());
  } catch (error) {
    publish({
      phase: 'error',
      source: state.phase === 'idle' ? 'manual' : state.source,
      visible: true,
      currentVersion: CURRENT_APP_VERSION,
      latestVersion: state.phase === 'idle' || state.phase === 'checking' ? undefined : state.latestVersion,
      failedOperation: 'download',
      failureReason: failureReasonForError(error),
    });
  }
}

export async function requestUpstreamUpdateInstall(): Promise<void> {
  if (!UPDATE_CHECKS_ENABLED) return;
  const desktop = hasDesktopUpdateSupport() ? ensureDesktopUpdateSubscription() : null;
  if (!desktop) return;
  try {
    syncDesktopUpdate(await desktop.install());
  } catch (error) {
    publish({
      phase: 'error',
      source: state.phase === 'idle' ? 'manual' : state.source,
      visible: true,
      currentVersion: CURRENT_APP_VERSION,
      latestVersion: state.phase === 'idle' || state.phase === 'checking' ? undefined : state.latestVersion,
      failedOperation: 'install',
      failureReason: failureReasonForError(error),
    });
  }
}

export function openUpstreamReleasePage(): void {
  if (typeof window === 'undefined' || !RELEASE_FEED) return;
  window.open(RELEASE_FEED.releasesPageUrl, '_blank', 'noopener,noreferrer');
}

export function startAutomaticUpstreamUpdateCheck(): void {
  if (!UPDATE_CHECKS_ENABLED) return;
  if (autoCheckStarted) return;
  autoCheckStarted = true;
  void requestUpstreamUpdateCheck('auto');
}
