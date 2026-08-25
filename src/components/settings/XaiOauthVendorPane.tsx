// xAI subscription login page. Login itself belongs to the official Grok CLI
// (`grok login` in a terminal); this pane imports the session server-side,
// shows the account, and refreshes or clears the imported session.
import { useEffect, useState } from 'react';
import { theme } from '../../theme';
import { useT } from '../../i18n/locale';
import { VendorIcon } from './vendorIcons';
import { FieldRow, ON, TestConnectionRow, type FieldCtx } from './settingsVendorPane';
import { modelValue, type SettingsField, type SettingsVendorPage } from './settingsSchema';
import { ModelCapabilityEditor } from './ModelCapabilityEditor';
import { MODEL_CAPABILITY_OVERRIDES_KEY } from '../../../shared/model-capabilities';
import { normalizeLlmProvider } from '../../../shared/llm-providers';

interface XaiOauthStatus {
  found: boolean;
  email: string;
  expiresAt: number;
  error: string;
}

const pane: React.CSSProperties = {
  flex: 1, minWidth: 0, overflowY: 'auto', padding: '14px 20px 16px',
  display: 'flex', flexDirection: 'column', gap: 12,
};
const card: React.CSSProperties = {
  background: theme.bg, border: `0.5px solid ${theme.border}`,
  borderRadius: 4, padding: '11px 13px',
};
const note: React.CSSProperties = { fontSize: 10.5, color: theme.textDim };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, minHeight: 26 };
const primary: React.CSSProperties = {
  font: 'inherit', fontSize: 11.5, color: '#fff', background: theme.accent,
  border: 'none', borderRadius: 4, padding: '5px 14px', cursor: 'pointer',
};
const danger: React.CSSProperties = {
  font: 'inherit', fontSize: 11.5, color: '#fff', background: '#c0392b',
  border: 'none', borderRadius: 4, padding: '5px 14px', cursor: 'pointer',
};
const code: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11, color: theme.text, background: theme.bg,
  border: `0.5px solid ${theme.border}`, borderRadius: 4, padding: '2px 7px',
};

function capabilityOverrides(ctx: FieldCtx): string {
  return ctx.values[MODEL_CAPABILITY_OVERRIDES_KEY]
    ?? modelValue(ctx.status, MODEL_CAPABILITY_OVERRIDES_KEY);
}

const CAPABILITY_OVERRIDE_FIELD: SettingsField = {
  name: MODEL_CAPABILITY_OVERRIDES_KEY, label: 'Model capabilities', kind: 'text', defaultLabel: '',
};

export function XaiOauthVendorPane({ page, hint, ctx }: {
  page: SettingsVendorPage; hint: string; ctx: FieldCtx;
}) {
  const t = useT();
  const [status, setStatus] = useState<XaiOauthStatus | null>(null);
  const [busy, setBusy] = useState<'' | 'import' | 'logout'>('');
  const [actionError, setActionError] = useState('');

  const load = async (): Promise<void> => {
    try {
      const response = await fetch('/api/xai-oauth/status');
      setStatus((await response.json()) as XaiOauthStatus);
    } catch {
      setStatus(null);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const run = async (action: 'import' | 'logout'): Promise<void> => {
    setBusy(action);
    setActionError('');
    try {
      const response = await fetch(`/api/xai-oauth/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const body = (await response.json()) as XaiOauthStatus & { error?: string };
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      setStatus(body);
      await ctx.refreshStatus();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
      await load();
    } finally {
      setBusy('');
    }
  };
  const loggedIn = status?.found === true;
  const expiryText = loggedIn && status.expiresAt > 0
    ? `${t('Session valid until')} ${new Date(status.expiresAt).toLocaleString()}`
    : '';
  const modelId = (ctx.values.LLM_XAI_OAUTH_MODEL
    ?? modelValue(ctx.status, 'LLM_XAI_OAUTH_MODEL')) || 'grok-4.6';

  return (
    <div style={pane}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <VendorIcon vendor={page.vendor} size={18} />
          <b style={{ fontSize: 13 }}>{t(page.title)}</b>
          <span style={{ fontSize: 11, color: loggedIn ? ON : theme.textDim }}>
            {loggedIn ? t('Signed in') : t('Signed out')}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: theme.textDim, marginTop: 3, paddingLeft: 26 }}>{t(hint)}</div>
      </div>
      <div style={card}>
        <div style={{ fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {loggedIn && status.email && <span>{status.email}</span>}
          {expiryText && <span style={note}>{expiryText}</span>}
          {status?.error && <span style={{ color: '#f77' }}>{status.error}</span>}
          {actionError && <span style={{ color: '#f77' }}>{actionError}</span>}
          {!loggedIn && (
            <>
              <span>{t('Sign in with the official Grok CLI in a terminal first, then import the login here:')}</span>
              <span><span style={code}>npm i -g @xai-official/grok && grok login</span></span>
              <span style={note}>{t('After signing in with your subscription (SuperGrok or X Premium+), grok login stores the session locally.')}</span>
            </>
          )}
        </div>
      </div>
      <section style={card}>
        {page.note && <div style={note}>{t(page.note)}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: page.note ? 9 : 0 }}>
          {page.fields.map((field) => <FieldRow key={field.name} field={field} ctx={ctx} />)}
        </div>
        <ModelCapabilityEditor backend="api" provider={normalizeLlmProvider(page.vendor)}
          modelId={modelId} rawOverrides={capabilityOverrides(ctx)}
          onChange={(value) => ctx.onStage(CAPABILITY_OVERRIDE_FIELD, value)} />
      </section>
      <div style={row}>
        {loggedIn ? (
          <>
            <button type="button" style={primary} disabled={busy !== ''}
              onClick={() => { void run('import'); }}>
              {busy === 'import' ? t('Processing…') : t('Re-import')}
            </button>
            <button type="button" style={danger} disabled={busy !== ''}
              onClick={() => { void run('logout'); }}>
              {busy === 'logout' ? t('Processing…') : t('Sign out')}
            </button>
          </>
        ) : (
          <button type="button" style={primary} disabled={busy !== ''}
            onClick={() => { void run('import'); }}>
            {busy === 'import' ? t('Processing…') : t('Import login')}
          </button>
        )}
      </div>
      <TestConnectionRow page={page} ctx={ctx} />
    </div>
  );
}
