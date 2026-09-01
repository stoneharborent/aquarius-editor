import type { AppUpdater, ProgressInfo, UpdateInfo } from 'electron-updater';
import type {
  DesktopUpdateCheckSource,
  DesktopUpdateFailureReason,
  DesktopUpdateOperation,
  DesktopUpdateState,
} from '../shared/desktop-update.ts';
import { failureReasonForError, isNewerReleaseVersion } from '../shared/desktop-update.ts';

/**
 * The AquariusOS overlay path, injected so this file stays free of `fs` and Electron.
 * Implemented by desktop/overlay-update.ts and wired up in desktop/update-ipc.ts.
 */
export interface OverlayUpdateDriver {
  /**
   * The newest published release version.
   *
   * The overlay checks the feed itself rather than through electron-updater. See
   * `checkThroughOverlay` below for why that is not optional.
   */
  readonly latestVersion: () => Promise<string>;
  /** Download, verify, extract, and activate `version` in the writable overlay. */
  readonly install: (
    version: string,
    hooks: { onProgress: (percent: number) => void; onExtractStart: () => void },
  ) => Promise<unknown>;
  /** Restart through the OS launcher so the newly activated copy is the one that runs. */
  readonly restart: () => void;
}

export interface DesktopUpdateServiceOptions {
  readonly enabled: boolean;
  readonly currentVersion: string;
  /**
   * Set only on AquariusOS, where the app is baked into a read-only image and cannot
   * replace itself in place. When present it takes over download and restart; the feed
   * and version check stay exactly the same as on every other platform.
   */
  readonly overlay?: OverlayUpdateDriver | null;
}

export interface DesktopUpdateSupportContext {
  readonly packaged: boolean;
  readonly smoke: boolean;
  readonly platform: NodeJS.Platform;
  /** Linux: the process was launched from a real AppImage (`process.env.APPIMAGE` is set). */
  readonly appImage?: boolean;
  /** Linux: AquariusOS baked this build in read-only and manages a writable overlay. */
  readonly osManagedOverlay?: boolean;
}

/**
 * Whether a release feed exists for Aquarius Editor to update from.
 *
 * Aquarius Editor publishes its own GitHub Releases, so the updater is live. It must never
 * be pointed anywhere but this fork's repository — upstream's feed serves a different app
 * on a different version line. Three siblings switch the same feature on and have to agree:
 * `publish` in config/electron-builder.config.mjs, RELEASE_FEED in src/ui/upstreamUpdate.ts,
 * and the update-metadata artifacts in .github/workflows/desktop.yml.
 */
export const DESKTOP_UPDATE_FEED_CONFIGURED = true;

/**
 * Platforms where a packaged build could install an update itself, feed aside.
 *
 * - Windows: the NSIS installer replaces the install directory in place.
 * - Linux from an AppImage: electron-updater's AppImageUpdater rewrites the .AppImage file,
 *   but only when `process.env.APPIMAGE` points at it. Claiming support without that env
 *   var makes the updater fail at install time, after the user has already downloaded.
 * - Linux on AquariusOS: the image copy is read-only, so the overlay driver installs beside
 *   it instead. Supported without APPIMAGE precisely because nothing is replaced in place.
 *   Saying "supported" here obliges the overlay to own the *whole* pipeline, check included;
 *   electron-updater refuses to run any of it without APPIMAGE (see `checkThroughOverlay`).
 * - macOS: builds are unsigned, so Squirrel.Mac would reject them. Those users are sent to
 *   the releases page instead (see src/ui/upstreamUpdateAction.ts, 'view-release').
 */
export function platformSupportsDirectDesktopUpdates(context: DesktopUpdateSupportContext): boolean {
  if (!context.packaged || context.smoke) return false;
  if (context.platform === 'win32') return true;
  if (context.platform === 'linux') {
    return context.appImage === true || context.osManagedOverlay === true;
  }
  return false;
}

export function supportsDirectDesktopUpdates(context: DesktopUpdateSupportContext): boolean {
  if (!DESKTOP_UPDATE_FEED_CONFIGURED) return false;
  return platformSupportsDirectDesktopUpdates(context);
}

type UpdateStateListener = (state: DesktopUpdateState) => void;

function releaseVersion(info: UpdateInfo): string {
  return info.version.trim().replace(/^v/i, '');
}

export class DesktopUpdateService {
  private readonly listeners = new Set<UpdateStateListener>();
  private readonly updater: AppUpdater;
  private readonly options: DesktopUpdateServiceOptions;
  private activeOperation: DesktopUpdateOperation = 'check';
  private state: DesktopUpdateState;

  constructor(updater: AppUpdater, options: DesktopUpdateServiceOptions) {
    this.updater = updater;
    this.options = options;
    this.state = {
      phase: options.enabled ? 'idle' : 'unsupported',
      source: 'auto',
      currentVersion: options.currentVersion,
    };
    if (options.enabled) this.configureUpdater();
  }

  private configureUpdater(): void {
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.allowDowngrade = false;
    this.updater.allowPrerelease = false;
    this.updater.on('checking-for-update', () => {
      this.publish({ ...this.state, phase: 'checking' });
    });
    this.updater.on('update-available', (info: UpdateInfo) => {
      this.publish({
        phase: 'available',
        source: this.state.source,
        currentVersion: this.options.currentVersion,
        latestVersion: releaseVersion(info),
      });
    });
    this.updater.on('update-not-available', (info: UpdateInfo) => {
      this.publish({
        phase: 'current',
        source: this.state.source,
        currentVersion: this.options.currentVersion,
        latestVersion: releaseVersion(info),
      });
    });
    this.updater.on('download-progress', (progress: ProgressInfo) => {
      this.publish({
        ...this.state,
        phase: 'downloading',
        percent: Math.min(100, Math.max(0, progress.percent)),
      });
    });
    this.updater.on('update-downloaded', (info: UpdateInfo) => {
      this.publish({
        phase: 'downloaded',
        source: this.state.source,
        currentVersion: this.options.currentVersion,
        latestVersion: releaseVersion(info),
        percent: 100,
      });
    });
    this.updater.on('error', (error: unknown) => {
      this.fail(this.activeOperation, failureReasonForError(error));
    });
  }

  private publish(next: DesktopUpdateState): void {
    this.state = next;
    this.listeners.forEach((listener) => { listener(next); });
  }

  private fail(operation: DesktopUpdateOperation, reason: DesktopUpdateFailureReason = 'unknown'): void {
    this.publish({
      phase: 'error',
      source: this.state.source,
      currentVersion: this.options.currentVersion,
      latestVersion: this.state.latestVersion,
      failedOperation: operation,
      failureReason: reason,
    });
  }

  getState(): DesktopUpdateState {
    return this.state;
  }

  subscribe(listener: UpdateStateListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async check(source: DesktopUpdateCheckSource): Promise<DesktopUpdateState> {
    if (!this.options.enabled) return this.state;
    if (['checking', 'downloading', 'installing'].includes(this.state.phase)) return this.state;
    this.activeOperation = 'check';
    this.publish({
      phase: 'checking',
      source,
      currentVersion: this.options.currentVersion,
    });
    if (this.options.overlay) return this.checkThroughOverlay(this.options.overlay);
    try {
      const result = await this.updater.checkForUpdates();
      if (!result && this.state.phase === 'checking') this.fail('check');
    } catch (error) {
      if (this.state.phase === 'checking') this.fail('check', failureReasonForError(error));
    }
    return this.state;
  }

  /**
   * The overlay's own version check — the fix for the AquariusOS "can't check for updates" bug.
   *
   * electron-updater cannot perform this check on AquariusOS. The app there is an *extracted*
   * AppImage started by /usr/bin/aquarius-editor, so `process.env.APPIMAGE` is unset, and
   * AppImageUpdater.isUpdaterActive() answers false for exactly that reason:
   *
   *     "APPIMAGE env is not defined, current application is not an AppImage"
   *
   * `checkForUpdates()` then returns `Promise.resolve(null)` without touching the network, and
   * the null-means-failure branch above turned that into a permanent "Unable to check for
   * updates" with a Check again button that could only ever fail the same way. The original
   * overlay design assumed only download and install needed APPIMAGE; isUpdaterActive() gates
   * the check too, so the assumption was wrong.
   *
   * Nothing here is a workaround for that gate — the overlay simply has no business going
   * through electron-updater at all. It already resolves its own asset URLs, verifies its own
   * checksums and swaps its own symlink; owning the check makes the pipeline consistent and
   * leaves electron-updater in charge only where it works: Windows NSIS and real AppImages.
   */
  private async checkThroughOverlay(overlay: OverlayUpdateDriver): Promise<DesktopUpdateState> {
    try {
      const latestVersion = await overlay.latestVersion();
      const updateAvailable = isNewerReleaseVersion(latestVersion, this.options.currentVersion);
      this.publish({
        phase: updateAvailable ? 'available' : 'current',
        source: this.state.source,
        currentVersion: this.options.currentVersion,
        latestVersion,
      });
    } catch (error) {
      this.fail('check', failureReasonForError(error));
    }
    return this.state;
  }

  async download(): Promise<DesktopUpdateState> {
    const canDownload = this.state.phase === 'available'
      || (this.state.phase === 'error' && this.state.failedOperation === 'download');
    if (!this.options.enabled || !canDownload || !this.state.latestVersion) return this.state;
    this.activeOperation = 'download';
    this.publish({
      ...this.state, phase: 'downloading', percent: 0, failedOperation: undefined, failureReason: undefined,
    });
    if (this.options.overlay) return this.installOverlay(this.options.overlay, this.state.latestVersion);
    try {
      await this.updater.downloadUpdate();
      if (this.state.phase === 'downloading') this.fail('download');
    } catch (error) {
      if (this.state.phase === 'downloading') this.fail('download', failureReasonForError(error));
    }
    return this.state;
  }

  /**
   * The overlay equivalent of electron-updater's download: the HTTP transfer reports
   * `downloading` percentages, the extract-and-swap reports `installing`, and a success
   * lands on `downloaded` so the same "Restart and install" prompt appears as everywhere
   * else. A failure is reported against 'download', which the UI offers to retry.
   */
  private async installOverlay(
    overlay: OverlayUpdateDriver,
    version: string,
  ): Promise<DesktopUpdateState> {
    try {
      await overlay.install(version, {
        onProgress: (percent) => {
          if (this.state.phase !== 'downloading') return;
          this.publish({
            ...this.state,
            phase: 'downloading',
            percent: Math.min(100, Math.max(0, percent)),
          });
        },
        onExtractStart: () => {
          if (this.state.phase !== 'downloading') return;
          this.publish({ ...this.state, phase: 'installing', percent: 100 });
        },
      });
      this.publish({
        phase: 'downloaded',
        source: this.state.source,
        currentVersion: this.options.currentVersion,
        latestVersion: version,
        percent: 100,
      });
    } catch (error) {
      this.fail('download', failureReasonForError(error));
    }
    return this.state;
  }

  install(): DesktopUpdateState {
    const canInstall = this.state.phase === 'downloaded'
      || (this.state.phase === 'error' && this.state.failedOperation === 'install');
    if (!this.options.enabled || !canInstall || !this.state.latestVersion) return this.state;
    this.activeOperation = 'install';
    this.publish({
      ...this.state, phase: 'installing', failedOperation: undefined, failureReason: undefined,
    });
    const overlay = this.options.overlay;
    globalThis.setTimeout(() => {
      try {
        if (overlay) overlay.restart();
        else this.updater.quitAndInstall();
      } catch (error) {
        this.fail('install', failureReasonForError(error));
      }
    }, 0);
    return this.state;
  }
}
