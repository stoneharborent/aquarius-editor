import { existsSync } from 'node:fs';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import electronUpdater from 'electron-updater';
import {
  DESKTOP_UPDATE_CHANNELS,
  isDesktopUpdateCheckSource,
  type DesktopUpdateState,
} from '../shared/desktop-update.ts';
import { assertTrustedDesktopSenderUrl } from './page-origin.ts';
import { createOverlayUpdateInstaller, OS_ENTRY_POINT, resolveOverlayRoot } from './overlay-update.ts';
import { DesktopUpdateService, type OverlayUpdateDriver } from './update-service.ts';

const { autoUpdater } = electronUpdater;

interface DesktopUpdateIpcOptions {
  readonly enabled: boolean;
}

function publishUpdateState(state: DesktopUpdateState): void {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) window.webContents.send(DESKTOP_UPDATE_CHANNELS.state, state);
  });
}

/**
 * Restart into the copy the overlay now points at.
 *
 * The running process was started from the read-only image, so relaunching argv[0] would
 * start the old version again. The OS launcher is what knows to prefer the overlay, so we
 * relaunch through it. If it is missing — someone set the env vars by hand — the honest
 * answer is to close and tell the user to start the app again themselves.
 */
function restartThroughOsEntryPoint(): void {
  if (existsSync(OS_ENTRY_POINT)) {
    app.relaunch({ execPath: OS_ENTRY_POINT, args: [] });
  } else {
    dialog.showMessageBoxSync({
      type: 'info',
      title: 'Update installed',
      message: 'Start Aquarius Editor again to use the new version.',
      buttons: ['Close'],
    });
  }
  app.quit();
}

/** The overlay driver, or null when this is not an AquariusOS OS-managed install. */
function resolveOverlayDriver(): OverlayUpdateDriver | null {
  const overlayRoot = resolveOverlayRoot(process.env);
  if (!overlayRoot) return null;
  const installer = createOverlayUpdateInstaller(overlayRoot);
  return {
    latestVersion: () => installer.latestVersion(),
    install: (version, hooks) => installer.install(version, hooks),
    restart: restartThroughOsEntryPoint,
  };
}

export function installDesktopUpdateIpc(
  trustedOrigin: string,
  options: DesktopUpdateIpcOptions,
): DesktopUpdateService {
  const service = new DesktopUpdateService(autoUpdater, {
    enabled: options.enabled,
    currentVersion: app.getVersion(),
    overlay: options.enabled ? resolveOverlayDriver() : null,
  });
  service.subscribe(publishUpdateState);

  ipcMain.handle(DESKTOP_UPDATE_CHANNELS.getState, (event) => {
    assertTrustedDesktopSenderUrl(event.senderFrame?.url ?? '', trustedOrigin);
    return service.getState();
  });
  ipcMain.handle(DESKTOP_UPDATE_CHANNELS.check, async (event, source: unknown) => {
    assertTrustedDesktopSenderUrl(event.senderFrame?.url ?? '', trustedOrigin);
    if (!isDesktopUpdateCheckSource(source)) throw new Error('invalid update check source');
    return service.check(source);
  });
  ipcMain.handle(DESKTOP_UPDATE_CHANNELS.download, async (event) => {
    assertTrustedDesktopSenderUrl(event.senderFrame?.url ?? '', trustedOrigin);
    return service.download();
  });
  ipcMain.handle(DESKTOP_UPDATE_CHANNELS.install, (event) => {
    assertTrustedDesktopSenderUrl(event.senderFrame?.url ?? '', trustedOrigin);
    return service.install();
  });

  return service;
}
