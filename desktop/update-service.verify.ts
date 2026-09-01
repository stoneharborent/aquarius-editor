import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import type { AppUpdater, UpdateInfo } from 'electron-updater';
import {
  DESKTOP_UPDATE_FEED_CONFIGURED,
  DesktopUpdateService,
  platformSupportsDirectDesktopUpdates,
  supportsDirectDesktopUpdates,
} from './update-service';

function updateInfo(version: string): UpdateInfo {
  return { version, releaseDate: new Date(0).toISOString(), files: [], path: '', sha512: '' };
}

class FakeUpdater extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  allowDowngrade = true;
  allowPrerelease = true;
  checkCalls = 0;
  downloadCalls = 0;
  installCalls = 0;
  nextVersion = '0.2.0';
  available = true;
  failDownload = false;

  async checkForUpdates(): Promise<unknown> {
    this.checkCalls += 1;
    this.emit('checking-for-update');
    const info = updateInfo(this.nextVersion);
    this.emit(this.available ? 'update-available' : 'update-not-available', info);
    return { isUpdateAvailable: this.available, updateInfo: info, versionInfo: info };
  }

  async downloadUpdate(): Promise<string[]> {
    this.downloadCalls += 1;
    if (this.failDownload) {
      const error = new Error('download failed');
      this.emit('error', error);
      throw error;
    }
    this.emit('download-progress', { percent: 42, bytesPerSecond: 1, total: 10, transferred: 4 });
    this.emit('update-downloaded', updateInfo(this.nextVersion));
    return ['/tmp/update'];
  }

  quitAndInstall(): void {
    this.installCalls += 1;
  }
}

// Aquarius Editor publishes its own releases, so the updater is live. The feed switch and
// its three siblings (electron-builder publish, RELEASE_FEED, the workflow's update metadata)
// have to stay on together — update-packaging.verify.ts pins the other three.
assert.equal(
  DESKTOP_UPDATE_FEED_CONFIGURED,
  true,
  'the release feed is configured; the updater must be enabled to match',
);
assert.equal(
  supportsDirectDesktopUpdates({ packaged: true, smoke: false, platform: 'win32' }),
  true,
  'packaged Windows builds update themselves in place',
);

// Windows NSIS replaces the install directory in place, no extra conditions.
assert.equal(
  platformSupportsDirectDesktopUpdates({ packaged: true, smoke: false, platform: 'win32' }),
  true,
  'Windows packaged builds must support direct updates',
);

// Linux: electron-updater's AppImageUpdater rewrites the .AppImage named by process.env.APPIMAGE.
// Without that variable it throws at install time — after the user has already downloaded —
// so an extracted Linux build must not claim in-place support.
assert.equal(
  platformSupportsDirectDesktopUpdates({ packaged: true, smoke: false, platform: 'linux', appImage: true }),
  true,
  'a Linux build launched from an AppImage can replace itself',
);
assert.equal(
  platformSupportsDirectDesktopUpdates({ packaged: true, smoke: false, platform: 'linux' }),
  false,
  'an extracted Linux build with no APPIMAGE must not promise an in-place update',
);
// AquariusOS is the exception: nothing is replaced in place, the overlay is installed beside
// the read-only image copy, so support does not depend on APPIMAGE.
assert.equal(
  platformSupportsDirectDesktopUpdates({
    packaged: true, smoke: false, platform: 'linux', osManagedOverlay: true,
  }),
  true,
  'the AquariusOS overlay path updates without an AppImage',
);

assert.equal(
  platformSupportsDirectDesktopUpdates({ packaged: true, smoke: false, platform: 'darwin' }),
  false,
  'ad-hoc signed macOS builds must use the release-page fallback',
);
assert.equal(
  platformSupportsDirectDesktopUpdates({
    packaged: true, smoke: false, platform: 'darwin', appImage: true, osManagedOverlay: true,
  }),
  false,
  'no Linux flag may accidentally grant macOS in-place updates',
);
assert.equal(
  platformSupportsDirectDesktopUpdates({ packaged: false, smoke: false, platform: 'win32' }),
  false,
  'development builds must not contact update servers',
);
assert.equal(
  platformSupportsDirectDesktopUpdates({
    packaged: true, smoke: true, platform: 'linux', osManagedOverlay: true,
  }),
  false,
  'smoke builds must not contact update servers',
);

const unsupportedUpdater = new FakeUpdater();
const unsupported = new DesktopUpdateService(unsupportedUpdater as unknown as AppUpdater, {
  enabled: false,
  currentVersion: '0.1.9',
});
assert.equal(unsupported.getState().phase, 'unsupported');
await unsupported.check('manual');
assert.equal(unsupportedUpdater.checkCalls, 0, 'development and smoke builds must not contact update servers');

const fake = new FakeUpdater();
const service = new DesktopUpdateService(fake as unknown as AppUpdater, {
  enabled: true,
  currentVersion: '0.1.9',
});
assert.equal(fake.autoDownload, false, 'updates require an explicit user download action');
assert.equal(fake.autoInstallOnAppQuit, false, 'downloaded updates must not install on an unrelated quit');
assert.equal(fake.allowDowngrade, false);
assert.equal(fake.allowPrerelease, false);

const observed: string[] = [];
service.subscribe((next) => { observed.push(next.phase); });
const available = await service.check('manual');
assert.equal(available.phase, 'available');
assert.equal(available.latestVersion, '0.2.0');
assert.equal(observed.at(-1), 'available');

const downloaded = await service.download();
assert.equal(downloaded.phase, 'downloaded');
assert.equal(downloaded.percent, 100);
assert.equal(fake.downloadCalls, 1);
assert.ok(observed.includes('downloading'), 'download progress must be observable by the renderer');

const installing = service.install();
assert.equal(installing.phase, 'installing');
assert.equal(fake.installCalls, 0, 'IPC must receive the installing state before the app exits');
await delay(0);
assert.equal(fake.installCalls, 1);

const retryFake = new FakeUpdater();
const retryService = new DesktopUpdateService(retryFake as unknown as AppUpdater, {
  enabled: true,
  currentVersion: '0.1.9',
});
await retryService.check('manual');
retryFake.failDownload = true;
assert.equal((await retryService.download()).failedOperation, 'download');
retryFake.failDownload = false;
assert.equal((await retryService.download()).phase, 'downloaded', 'a failed download must remain retryable');

const currentFake = new FakeUpdater();
currentFake.available = false;
currentFake.nextVersion = '0.1.9';
const currentService = new DesktopUpdateService(currentFake as unknown as AppUpdater, {
  enabled: true,
  currentVersion: '0.1.9',
});
assert.equal((await currentService.check('manual')).phase, 'current');
assert.equal(currentService.install().phase, 'current', 'install is forbidden before an update is downloaded');
assert.equal(currentFake.installCalls, 0);

// --- AquariusOS overlay mode -------------------------------------------------------------
// The overlay reuses the whole state machine: the same phases, the same renderer. The check,
// the download and the restart are all its own — see the isUpdaterActive regression below for
// why the check cannot be electron-updater's.
function overlayDriver(options: { fail?: boolean; latest?: string; checkError?: unknown } = {}) {
  const record = { versions: [] as string[], restarts: 0, checks: 0 };
  return {
    record,
    driver: {
      latestVersion: async () => {
        record.checks += 1;
        if (options.checkError !== undefined) throw options.checkError;
        return options.latest ?? '0.2.0';
      },
      install: async (
        version: string,
        hooks: { onProgress: (percent: number) => void; onExtractStart: () => void },
      ) => {
        record.versions.push(version);
        hooks.onProgress(40);
        if (options.fail) throw new Error('overlay install failed');
        hooks.onExtractStart();
        return undefined;
      },
      restart: () => { record.restarts += 1; },
    },
  };
}

const overlay = overlayDriver();
const overlayFake = new FakeUpdater();
const overlayService = new DesktopUpdateService(overlayFake as unknown as AppUpdater, {
  enabled: true,
  currentVersion: '0.1.9',
  overlay: overlay.driver,
});
const overlayPhases: string[] = [];
overlayService.subscribe((next) => { overlayPhases.push(next.phase); });
assert.equal((await overlayService.check('manual')).phase, 'available');
assert.equal(overlay.record.checks, 1, 'the overlay asks its own driver what the newest release is');
assert.equal(
  overlayFake.checkCalls,
  0,
  'electron-updater must never perform the check in overlay mode — it refuses to without APPIMAGE',
);

const overlayDownloaded = await overlayService.download();
assert.equal(overlayFake.downloadCalls, 0, 'electron-updater must never download in overlay mode');
assert.deepEqual(overlay.record.versions, ['0.2.0'], 'the overlay installs the version the feed reported');
assert.equal(overlayDownloaded.phase, 'downloaded');
assert.equal(overlayDownloaded.percent, 100);
assert.ok(overlayPhases.includes('downloading'), 'the HTTP transfer reports download progress');
assert.ok(
  overlayPhases.indexOf('installing') > overlayPhases.indexOf('downloading'),
  'extracting and swapping the overlay reports the installing phase',
);
assert.equal(overlayPhases.at(-1), 'downloaded', 'a finished overlay install prompts for a restart');

assert.equal(overlayService.install().phase, 'installing');
assert.equal(overlay.record.restarts, 0, 'IPC must receive the installing state before the app exits');
await delay(0);
assert.equal(overlay.record.restarts, 1, 'the overlay restarts through the OS launcher');
assert.equal(overlayFake.installCalls, 0, 'quitAndInstall must never run against a read-only image copy');

const failing = overlayDriver({ fail: true });
const failingService = new DesktopUpdateService(new FakeUpdater() as unknown as AppUpdater, {
  enabled: true,
  currentVersion: '0.1.9',
  overlay: failing.driver,
});
await failingService.check('manual');
const failedOverlay = await failingService.download();
assert.equal(failedOverlay.phase, 'error');
assert.equal(failedOverlay.failedOperation, 'download', 'a failed overlay install stays retryable as a download');
assert.equal(failingService.install().phase, 'error', 'a failed download must not offer a restart');
assert.equal(failing.record.restarts, 0);

// --- regression: AquariusOS could not check for updates at all (v0.6.0) --------------------
// On AquariusOS the app is an EXTRACTED AppImage started by /usr/bin/aquarius-editor, so
// process.env.APPIMAGE is unset. electron-updater's AppImageUpdater.isUpdaterActive() answers
// false for exactly that reason ("APPIMAGE env is not defined, current application is not an
// AppImage") and checkForUpdates() then resolves NULL without any network call. v0.6.0 routed
// the overlay check through it anyway and turned that null into a permanent
// "Unable to check for updates" that no amount of retrying could clear.
//
// This updater reproduces that exact behaviour. The overlay check must not care.
class InactiveAppImageUpdater extends FakeUpdater {
  override async checkForUpdates(): Promise<unknown> {
    this.checkCalls += 1;
    return null; // isUpdaterActive() === false
  }
}

const inactive = new InactiveAppImageUpdater();
const strandedService = new DesktopUpdateService(inactive as unknown as AppUpdater, {
  enabled: true,
  currentVersion: '0.6.0',
});
assert.equal(
  (await strandedService.check('manual')).phase,
  'error',
  'without an overlay a null check result is still a failure, as electron-updater intends',
);

const rescued = overlayDriver({ latest: '0.7.0' });
const rescuedService = new DesktopUpdateService(new InactiveAppImageUpdater() as unknown as AppUpdater, {
  enabled: true,
  currentVersion: '0.6.0',
  overlay: rescued.driver,
});
const rescuedState = await rescuedService.check('manual');
assert.equal(
  rescuedState.phase,
  'available',
  'the overlay check must find the release even though electron-updater refuses to look',
);
assert.equal(rescuedState.latestVersion, '0.7.0');

// The same comparison must also settle "already current" without electron-updater.
const currentOverlay = overlayDriver({ latest: '0.7.0' });
const currentOverlayService = new DesktopUpdateService(
  new InactiveAppImageUpdater() as unknown as AppUpdater,
  { enabled: true, currentVersion: '0.7.0', overlay: currentOverlay.driver },
);
assert.equal((await currentOverlayService.check('manual')).phase, 'current');

// A real check failure must still be reported — and must say why, so the message can be
// something better than "please try again later".
for (const [thrown, reason] of [
  [Object.assign(new Error('rate limited'), { reason: 'rate-limited' }), 'rate-limited'],
  [new TypeError('fetch failed'), 'offline'],
  [new Error('something else'), 'unknown'],
] as const) {
  const brokenFeed = overlayDriver({ checkError: thrown });
  const brokenService = new DesktopUpdateService(new FakeUpdater() as unknown as AppUpdater, {
    enabled: true,
    currentVersion: '0.6.0',
    overlay: brokenFeed.driver,
  });
  const failed = await brokenService.check('manual');
  assert.equal(failed.phase, 'error');
  assert.equal(failed.failedOperation, 'check');
  assert.equal(failed.failureReason, reason, `a ${reason} check failure must be reported as such`);
}

console.log('update-service.verify: explicit check, download, retry, progress, install, overlay lifecycle, and the APPIMAGE-free overlay check OK');
