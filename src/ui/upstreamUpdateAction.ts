import type { DesktopUpdateFailureReason } from '../../shared/desktop-update';
import { t } from '../i18n/locale';
import {
  openUpstreamReleasePage,
  formatDisplayVersion,
  requestUpstreamUpdateCheck,
  requestUpstreamUpdateDownload,
  requestUpstreamUpdateInstall,
  type UpstreamUpdateState,
} from './upstreamUpdate';

export type UpstreamUpdateCommand = 'check' | 'download' | 'install' | 'view-release' | 'none';

export interface UpstreamUpdateAction {
  readonly label: string;
  readonly disabled: boolean;
  readonly command: UpstreamUpdateCommand;
}

/**
 * The way out when the updater itself is the thing that is broken.
 *
 * v0.6.0 on AquariusOS could not check for updates at all, and the only control it offered
 * was "Check again" — a button whose every press failed identically, with no route to the
 * release that would have fixed it. Any failure now also offers the releases page, which is
 * reachable in a browser even when the in-app updater is not.
 */
export function resolveUpstreamUpdateFallbackAction(
  state: UpstreamUpdateState,
): UpstreamUpdateAction | null {
  if (state.phase !== 'error') return null;
  return { label: t('Open releases page'), disabled: false, command: 'view-release' };
}

export function resolveUpstreamUpdateAction(
  state: UpstreamUpdateState,
  desktopUpdate: boolean,
): UpstreamUpdateAction {
  if (state.phase === 'checking') return { label: t('Checking…'), disabled: true, command: 'none' };
  if (state.phase === 'available') {
    return desktopUpdate
      ? { label: t('Download update'), disabled: false, command: 'download' }
      : { label: t('View release'), disabled: false, command: 'view-release' };
  }
  if (state.phase === 'downloading') {
    return {
      label: t('Downloading {percent}%', { percent: Math.round(state.percent) }),
      disabled: true,
      command: 'none',
    };
  }
  if (state.phase === 'downloaded') {
    return { label: t('Restart and install'), disabled: false, command: 'install' };
  }
  if (state.phase === 'installing') return { label: t('Restarting…'), disabled: true, command: 'none' };
  if (state.phase === 'error') {
    if (state.failedOperation === 'download') {
      return { label: t('Retry download'), disabled: false, command: 'download' };
    }
    if (state.failedOperation === 'install') {
      return { label: t('Retry installation'), disabled: false, command: 'install' };
    }
    return { label: t('Check again'), disabled: false, command: 'check' };
  }
  return { label: t('Check for updates'), disabled: false, command: 'check' };
}

export function upstreamUpdateMessage(state: UpstreamUpdateState, desktopUpdate: boolean): string {
  if (state.phase === 'available') {
    const params = {
      latest: formatDisplayVersion(state.latestVersion),
      current: formatDisplayVersion(state.currentVersion),
    };
    return desktopUpdate
      ? t('Aquarius Editor {latest} is available; current version: {current}. Download and install it directly.', params)
      : t('Aquarius Editor {latest} is available; current version: {current}. Visit the project repository to review the update.', params);
  }
  if (state.phase === 'current') {
    return t('You are using the latest version, {version}.', { version: formatDisplayVersion(state.currentVersion) });
  }
  if (state.phase === 'downloading') {
    return t('Downloading Aquarius Editor {latest}: {percent}%', {
      latest: formatDisplayVersion(state.latestVersion),
      percent: Math.round(state.percent),
    });
  }
  if (state.phase === 'downloaded') {
    return t('Aquarius Editor {latest} is downloaded. Restart to finish installing.', {
      latest: formatDisplayVersion(state.latestVersion),
    });
  }
  if (state.phase === 'installing') return t('Restarting to install Aquarius Editor…');
  if (state.phase === 'error' && state.failedOperation === 'download') return t('The update download failed. Try again.');
  if (state.phase === 'error' && state.failedOperation === 'install') return t('The update installation failed. Try again.');
  if (state.phase === 'error') return failedCheckMessage(state.failureReason);
  return t('Unable to check for updates. Please try again later.');
}

/**
 * Says *why* the check failed, so the reader knows whether to fix their wifi, wait, or give
 * up on the in-app updater and open the releases page. "Please try again later" told Royce
 * none of those things while his install was permanently unable to check at all.
 */
function failedCheckMessage(reason: DesktopUpdateFailureReason): string {
  if (reason === 'offline') {
    return t('Could not reach the update server. Check your internet connection, or open the releases page in a browser.');
  }
  if (reason === 'rate-limited') {
    return t('The update server is temporarily rate-limiting this device. Try again in a few minutes, or open the releases page.');
  }
  if (reason === 'unavailable') {
    return t('The update server could not be reached right now. Try again later, or open the releases page.');
  }
  if (reason === 'unreadable') {
    return t('The update server sent a response this version could not read. Open the releases page to update manually.');
  }
  return t('This build could not check for updates. Open the releases page to update manually.');
}

export function runUpstreamUpdateCommand(command: UpstreamUpdateCommand): void {
  if (command === 'check') void requestUpstreamUpdateCheck('manual');
  else if (command === 'download') void requestUpstreamUpdateDownload();
  else if (command === 'install') void requestUpstreamUpdateInstall();
  else if (command === 'view-release') openUpstreamReleasePage();
}
