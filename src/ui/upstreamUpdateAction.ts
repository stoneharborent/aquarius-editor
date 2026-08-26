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
      ? t('Aquarius Cut {latest} is available; current version: {current}. Download and install it directly.', params)
      : t('Aquarius Cut {latest} is available; current version: {current}. Visit the project repository to review the update.', params);
  }
  if (state.phase === 'current') {
    return t('You are using the latest version, {version}.', { version: formatDisplayVersion(state.currentVersion) });
  }
  if (state.phase === 'downloading') {
    return t('Downloading Aquarius Cut {latest}: {percent}%', {
      latest: formatDisplayVersion(state.latestVersion),
      percent: Math.round(state.percent),
    });
  }
  if (state.phase === 'downloaded') {
    return t('Aquarius Cut {latest} is downloaded. Restart to finish installing.', {
      latest: formatDisplayVersion(state.latestVersion),
    });
  }
  if (state.phase === 'installing') return t('Restarting to install Aquarius Cut…');
  if (state.phase === 'error' && state.failedOperation === 'download') return t('The update download failed. Try again.');
  if (state.phase === 'error' && state.failedOperation === 'install') return t('The update installation failed. Try again.');
  return t('Unable to check for updates. Please try again later.');
}

export function runUpstreamUpdateCommand(command: UpstreamUpdateCommand): void {
  if (command === 'check') void requestUpstreamUpdateCheck('manual');
  else if (command === 'download') void requestUpstreamUpdateDownload();
  else if (command === 'install') void requestUpstreamUpdateInstall();
  else if (command === 'view-release') openUpstreamReleasePage();
}
