// The card the Hyperframes tab shows while the built-in graphics model is being
// fetched — and the offer it shows before and after.
//
// This is what "zero setup" actually looks like in the product. The weights are
// 2.33 GiB, which is more than GitHub will host as a release asset, so they
// cannot be inside the installer; the app downloads them itself instead. The
// user's side of that is one line of text and a percentage, with two ways out at
// all times: pause it, or connect their own model and never think about it again.
//
// Presentational on purpose — state in, callbacks out — so every render state
// can be exercised without a server.
import { theme } from '../theme';
import { useT } from '../i18n/locale';
import {
  builtinLlmDownloadPercent,
  formatDownloadSize,
  type BuiltinLlmDownloadState,
} from '../../shared/builtin-llm-download';

export interface BuiltinLlmDownloadCardProps {
  readonly state: BuiltinLlmDownloadState;
  readonly busy?: boolean;
  readonly compact?: boolean;
  readonly onStart: () => void;
  readonly onPause: () => void;
  readonly onDecline: () => void;
  /** Reveals the provider setup card instead. */
  readonly onUseOwnModel: () => void;
}

export function BuiltinLlmDownloadCard({
  state, busy, compact, onStart, onPause, onDecline, onUseOwnModel,
}: BuiltinLlmDownloadCardProps) {
  const t = useT();
  // Nothing to say once the weights are here: the card's whole job is done and
  // it gets out of the way, exactly as it would have if they had been bundled.
  if (state.status === 'ready') return null;
  const size = formatDownloadSize(state.bytesTotal);
  const percent = builtinLlmDownloadPercent(state);
  const downloading = state.status === 'downloading';
  const paused = state.status === 'paused';
  const failed = state.status === 'error';

  const headline = downloading
    ? t('Setting up the built-in graphics model ({size}) — {percent}%', { size, percent: String(percent) })
    : paused
      ? t('Built-in graphics model — paused at {percent}%', { percent: String(percent) })
      : failed
        ? t('The built-in graphics model could not be downloaded')
        : t('Set up the built-in graphics model');

  const body = downloading
    ? t('It downloads once, in the background, and then graphics generate with nothing configured. You can keep working — this does not need the app open on this tab.')
    : paused
      ? t('Resuming continues from where it stopped; nothing already downloaded is thrown away.')
      : failed
        ? t('Nothing was kept from the failed attempt. Trying again is safe.')
        : t('Downloading it once makes graphic generation work with no account, no key and no setup. It runs entirely on this machine.');

  return (
    <section
      className="cc-builtin-llm-card"
      data-status={state.status}
      aria-label={t('Set up the built-in graphics model')}
      style={{
        border: `0.5px solid ${failed ? theme.danger : theme.border}`,
        borderRadius: 6,
        background: theme.panelAlt,
        padding: compact ? 10 : 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 600, color: theme.text }}>{headline}</div>
      <div style={{ fontSize: 11, lineHeight: 1.45, color: theme.textDim }}>{body}</div>
      {state.error && (
        <div style={{ fontSize: 11, lineHeight: 1.45, color: theme.danger, overflowWrap: 'anywhere' }}>
          {state.error}
        </div>
      )}
      {(downloading || paused) && (
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('Download progress')}
          style={{
            height: 4,
            borderRadius: 2,
            background: theme.inset,
            overflow: 'hidden',
          }}
        >
          <div style={{ width: `${percent}%`, height: '100%', background: theme.accent }} />
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {downloading ? (
          <button type="button" disabled={busy} onClick={onPause} style={secondaryButton}>
            {t('Pause')}
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={onStart} style={primaryButton(busy)}>
            {paused
              ? t('Resume download')
              : failed
                ? t('Try again')
                : t('Download built-in model ({size})', { size })}
          </button>
        )}
        {/* Declining is offered only while nothing is running: a paused or failed
            card already leaves the user alone, and one more "no" button there
            would be noise rather than a choice. */}
        {!downloading && !paused && !state.declined && (
          <button type="button" disabled={busy} onClick={onDecline} style={secondaryButton}>
            {t('Not now')}
          </button>
        )}
        <button type="button" onClick={onUseOwnModel} style={linkButton}>
          {t('Use your own model instead')}
        </button>
      </div>
    </section>
  );
}

const primaryButton = (busy?: boolean): React.CSSProperties => ({
  border: 'none',
  borderRadius: 5,
  background: busy ? theme.inset : theme.accent,
  color: busy ? theme.textDim : theme.onAccent,
  cursor: busy ? 'default' : 'pointer',
  fontSize: 11.5,
  fontWeight: 600,
  padding: '6px 14px',
});

const secondaryButton: React.CSSProperties = {
  border: `0.5px solid ${theme.border}`,
  borderRadius: 5,
  background: 'none',
  color: theme.text,
  cursor: 'pointer',
  fontSize: 11.5,
  padding: '5px 12px',
};

const linkButton: React.CSSProperties = {
  border: 'none',
  background: 'none',
  color: theme.textDim,
  cursor: 'pointer',
  fontSize: 10.5,
  padding: 0,
  textAlign: 'left',
  textDecoration: 'underline',
};
