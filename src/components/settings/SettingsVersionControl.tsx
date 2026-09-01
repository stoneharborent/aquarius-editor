import { theme, themeAlpha } from '../../theme';

/**
 * Version line in the settings header. `actionLabel` is optional: Aquarius Editor has no
 * release feed yet, and a build that cannot check for updates shows the version alone
 * rather than a button that does nothing.
 */
export function SettingsVersionControl({
  versionLabel,
  actionLabel,
  disabled,
  fallbackLabel,
  onAction,
  onFallback,
}: {
  versionLabel: string;
  actionLabel?: string;
  disabled: boolean;
  /** Shown beside the retry when the updater failed, so the header is never a dead end. */
  fallbackLabel?: string;
  onAction: () => void;
  onFallback?: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
      <span style={{ color: theme.textDim, fontSize: 11.5 }}>{versionLabel}</span>
      {fallbackLabel === undefined || onFallback === undefined ? null : <button
        type="button"
        onClick={onFallback}
        style={{
          appearance: 'none',
          border: `0.5px solid ${theme.border}`,
          borderRadius: 4,
          background: 'transparent',
          color: theme.text,
          cursor: 'pointer',
          font: 'inherit',
          fontSize: 11.5,
          lineHeight: 1,
          padding: '6px 8px',
        }}
      >
        {fallbackLabel}
      </button>}
      {actionLabel === undefined ? null : <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        onMouseEnter={(event) => {
          if (!disabled) event.currentTarget.style.background = themeAlpha.ink(0.07);
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = themeAlpha.ink(0.035);
        }}
        style={{
          appearance: 'none',
          border: `0.5px solid ${theme.border}`,
          borderRadius: 4,
          background: themeAlpha.ink(0.035),
          color: disabled ? theme.textDim : theme.text,
          cursor: disabled ? 'default' : 'pointer',
          font: 'inherit',
          fontSize: 11.5,
          lineHeight: 1,
          padding: '6px 8px',
        }}
      >
        {actionLabel}
      </button>}
    </div>
  );
}
