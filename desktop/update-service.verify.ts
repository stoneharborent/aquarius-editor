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
// The overlay reuses the whole state machine: the same feed check, the same phases, the same
// renderer. Only the download and the restart are replaced.
function overlayDriver(options: { fail?: boolean } = {}) {
  const record = { versions: [] as string[], restarts: 0 };
  return {
    record,
    driver: {
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
assert.equal(overlayFake.checkCalls, 1, 'the overlay path checks the same release feed as every other build');

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

console.log('update-service.verify: explicit check, download, retry, progress, install, and overlay lifecycle OK');
