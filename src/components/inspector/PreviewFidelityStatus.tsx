import { theme } from '../../theme';
import type { SelectedPreviewStatus } from '../../gl/previewAdapter';
import { t, useT } from '../../i18n/locale';

function fallbackReasonText(status: SelectedPreviewStatus): string {
  if (status.fallbackReason === 'webgl-unavailable') return t('WebGL2 unavailable');
  if (status.fallbackReason === 'unsupported-media') return t('Media type does not support texture preview');
  if (status.fallbackReason === 'missing-shader') return t('Shader resource missing');
  if (status.fallbackReason === 'shader-error') return t('Shader compilation or runtime failure');
  if (status.fallbackReason === 'unsupported-transition') return t('Transition does not support GL');
  return t('Resource not ready yet');
}

export function PreviewFidelityStatus({ status }: { status?: SelectedPreviewStatus }) {
  const t = useT();
  if (!status || status.phase === 'inactive') return null;
  const fallback = status.phase === 'fallback';
  const label = status.phase === 'ready'
    ? t('Real GL preview · shares parameters with export')
    : status.phase === 'waiting'
      ? t('Preparing real GL preview…')
      : status.adapter === 'css-transition'
        ? t('CSS fallback preview · does not represent the export')
        : t('Source fallback · effects not shown');
  return (
    <div role="status" aria-live="polite" style={{
      display: 'flex', alignItems: 'center', gap: 6, minHeight: 24,
      padding: '4px 6px', border: `0.5px solid ${fallback ? theme.accent : theme.border}`,
      borderRadius: 4, color: fallback ? theme.text : theme.textMuted,
      background: theme.panelAlt, fontSize: 10.5, lineHeight: 1.35,
    }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', flex: '0 0 auto', background: fallback ? theme.accent : status.phase === 'ready' ? theme.success : theme.textDim }} />
      <span>{label}{fallback ? ` · ${t(fallbackReasonText(status))}` : ''}</span>
    </div>
  );
}
