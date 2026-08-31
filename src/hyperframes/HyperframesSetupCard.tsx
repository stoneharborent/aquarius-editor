// The only model-configuration UI left in the app: a small inline card that
// writes through the existing /api/keys endpoint, so the key value goes
// browser → server once and never comes back.
//
// It now has two jobs. When the app is generating with the model in the
// installer, the card is an OPTIONAL upgrade — "this works; here is how to make
// it better" — and the tab never blocks on it. It goes back to being required
// only when there is genuinely nothing to generate with, which since the model
// ships means a missing or damaged weight file; `problem` says which.
import { useState } from 'react';
import { theme } from '../theme';
import { useT } from '../i18n/locale';
import { isLocalLlmProvider, type LlmProvider } from '../../shared/llm-providers';
import { HYPERFRAMES_PROVIDER_OPTIONS, saveHyperframesProvider, type HyperframesProblem } from './api';

interface HyperframesSetupCardProps {
  /** Re-reads the server's view of the configuration after a successful save. */
  onSaved: () => void;
  compact?: boolean;
  /** True when the bundled model is already generating and this is an upgrade. */
  upgrade?: boolean;
  /** Server code for why the bundled model is unusable. */
  problem?: HyperframesProblem;
}

export function HyperframesSetupCard({ onSaved, compact, upgrade, problem }: HyperframesSetupCardProps) {
  const t = useT();
  // The weights are not in the installer — they are too large for a release
  // asset — so 'model-missing' means "not downloaded yet", not "broken". Someone
  // reading this card has already chosen to skip that download, so the copy
  // points at the provider rather than back at the offer they just declined.
  // 'model-corrupt' still means a damaged file that someone put there.
  const problemText = problem === 'model-corrupt'
    ? t('The built-in model file is the wrong size, so it was not loaded. Connect a provider here to keep generating.')
    : problem === 'runtime-unavailable'
      ? t('This build has no local model runtime, so the built-in model cannot run. Connect a provider here.')
      : problem === 'model-downloading'
        ? t('The built-in model is still downloading. You can wait for it, or connect a provider here and generate now.')
        : problem === 'model-missing'
          ? t('The built-in model has not been downloaded yet. You can fetch it from the previous card, or generate with whichever provider you connect here — a local runtime (Ollama or LM Studio) needs no key and no account.')
          : null;
  const [provider, setProvider] = useState<LlmProvider>(HYPERFRAMES_PROVIDER_OPTIONS[0]!.id);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const local = isLocalLlmProvider(provider);
  const canSave = !saving && (local || apiKey.trim().length > 0);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveHyperframesProvider(provider, apiKey);
      setApiKey('');
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="cc-hyperframes-setup"
      aria-label={upgrade ? t('Use a stronger model for graphics') : t('Set up graphic generation')}
      style={{
        border: `0.5px solid ${theme.border}`,
        borderRadius: 6,
        background: theme.panelAlt,
        padding: compact ? 10 : 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 600, color: theme.text }}>
        {upgrade ? t('Use a stronger model') : t('Connect a model to generate graphics')}
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.45, color: theme.textDim }}>
        {upgrade
          ? t('Graphics are being written by the model built into this app, which runs entirely on your machine. Connecting a larger model usually follows a complicated brief more closely. The key is stored on this machine and never leaves it.')
          : t('Hyperframes writes each graphic with a language model. Pick a provider and paste its API key — the key is stored on this machine and never leaves it. Local runtimes need no key.')}
      </div>
      {problemText && (
        <div style={{ fontSize: 11, lineHeight: 1.45, color: theme.danger }}>{problemText}</div>
      )}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: theme.textDim }}>
        {t('Provider')}
        <select
          value={provider}
          onChange={(event) => setProvider(event.target.value as LlmProvider)}
          style={fieldStyle}
        >
          {HYPERFRAMES_PROVIDER_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
      {!local && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: theme.textDim }}>
          {t('API key')}
          <input
            type="password"
            value={apiKey}
            autoComplete="off"
            spellCheck={false}
            placeholder={t('Paste the API key')}
            onChange={(event) => setApiKey(event.target.value)}
            style={fieldStyle}
          />
        </label>
      )}
      {error && <div style={{ fontSize: 11, color: theme.danger }}>{error}</div>}
      <button
        type="button"
        disabled={!canSave}
        onClick={() => { void save(); }}
        style={{
          alignSelf: 'flex-start',
          border: 'none',
          borderRadius: 5,
          background: canSave ? theme.accent : theme.inset,
          color: canSave ? theme.onAccent : theme.textDim,
          cursor: canSave ? 'pointer' : 'default',
          fontSize: 11.5,
          fontWeight: 600,
          padding: '6px 14px',
        }}
      >
        {saving ? t('Saving…') : t('Save and continue')}
      </button>
    </section>
  );
}

const fieldStyle: React.CSSProperties = {
  border: `0.5px solid ${theme.border}`,
  borderRadius: 4,
  background: theme.inset,
  color: theme.text,
  fontSize: 12,
  padding: '6px 8px',
  width: '100%',
  boxSizing: 'border-box',
};
