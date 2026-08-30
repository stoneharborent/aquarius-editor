// The only model-configuration UI left in the app: a small inline card shown
// where a generation would otherwise be attempted with nothing behind it. It
// writes through the existing /api/keys endpoint, so the key value goes
// browser → server once and never comes back.
import { useState } from 'react';
import { theme } from '../theme';
import { useT } from '../i18n/locale';
import { isLocalLlmProvider, type LlmProvider } from '../../shared/llm-providers';
import { HYPERFRAMES_PROVIDER_OPTIONS, saveHyperframesProvider } from './api';

interface HyperframesSetupCardProps {
  /** Re-reads the server's view of the configuration after a successful save. */
  onSaved: () => void;
  compact?: boolean;
}

export function HyperframesSetupCard({ onSaved, compact }: HyperframesSetupCardProps) {
  const t = useT();
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
      aria-label={t('Set up graphic generation')}
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
        {t('Connect a model to generate graphics')}
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.45, color: theme.textDim }}>
        {t('Hyperframes writes each graphic with a language model. Pick a provider and paste its API key — the key is stored on this machine and never leaves it. Local runtimes need no key.')}
      </div>
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
