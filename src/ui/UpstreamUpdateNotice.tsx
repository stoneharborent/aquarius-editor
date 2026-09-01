import { useEffect, useSyncExternalStore } from 'react';
import { useT } from '../i18n/locale';
import {
  dismissUpstreamUpdate,
  getUpstreamUpdateState,
  hasDesktopUpdateSupport,
  startAutomaticUpstreamUpdateCheck,
  subscribeUpstreamUpdate,
} from './upstreamUpdate';
import {
  resolveUpstreamUpdateAction,
  resolveUpstreamUpdateFallbackAction,
  runUpstreamUpdateCommand,
  upstreamUpdateMessage,
} from './upstreamUpdateAction';
import { UpstreamUpdateNoticeView } from './UpstreamUpdateNoticeView';

export function UpstreamUpdateNotice() {
  const t = useT();
  const update = useSyncExternalStore(
    subscribeUpstreamUpdate,
    getUpstreamUpdateState,
    getUpstreamUpdateState,
  );

  useEffect(() => { startAutomaticUpstreamUpdateCheck(); }, []);

  if (!update.visible) return null;

  const desktopUpdate = hasDesktopUpdateSupport();
  const action = resolveUpstreamUpdateAction(update, desktopUpdate);
  const showAction = update.phase !== 'current';
  // Present only on a failure, and never the same command as the retry beside it, so a
  // broken updater always leaves one route to the release.
  const fallback = resolveUpstreamUpdateFallbackAction(update);
  const showFallback = fallback !== null && fallback.command !== action.command;

  return (
    <UpstreamUpdateNoticeView
      message={upstreamUpdateMessage(update, desktopUpdate)}
      actionLabel={showAction ? action.label : undefined}
      actionDisabled={action.disabled}
      fallbackLabel={showFallback ? fallback.label : undefined}
      closeLabel={t('Close')}
      onAction={showAction ? () => { runUpstreamUpdateCommand(action.command); } : undefined}
      onFallback={showFallback ? () => { runUpstreamUpdateCommand(fallback.command); } : undefined}
      onDismiss={dismissUpstreamUpdate}
    />
  );
}
