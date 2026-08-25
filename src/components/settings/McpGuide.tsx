// Trusted editor guide for the authenticated Streamable HTTP endpoint.
// Clients connect through the one-click server-side writer; no copy-paste.
import { useEffect, useState, type ReactElement } from 'react';
import { editorBootstrapInfo } from '../../agent/editor-credential';
import { theme, themeAlpha } from '../../theme';
import { useT } from '../../i18n/locale';
import { Icon } from '../icons';
import claudeSvg from '../../../assets/vendor-icons/claude-color.svg?raw';
import codexPng from '../../../assets/vendor-icons/codex-color.png';
import cursorPng from '../../../assets/vendor-icons/cursor-color.png';
import antigravityPng from '../../../assets/vendor-icons/antigravity-color.png';

interface ClientSnippet {
  client: 'claude' | 'codex' | 'cursor' | 'antigravity';
  logo: ReactElement;
  name: string;
  desc: string;
}

function clientSnippets(): ClientSnippet[] {
  return [
    {
      client: 'claude',
      logo: <span aria-hidden className="cc-vendor-icon" style={{ color: '#d97757', width: 26, height: 26, fontSize: 26, display: 'inline-flex' }} dangerouslySetInnerHTML={{ __html: claudeSvg }} />,
      name: 'Claude Code',
      desc: 'Official Anthropic CLI, for Claude subscribers.',
    },
    {
      client: 'codex',
      logo: <ClientLogo src={codexPng} alt="Codex" />,
      name: 'Codex',
      desc: 'Official OpenAI CLI, carries the token via environment variable.',
    },
    {
      client: 'cursor',
      logo: <ClientLogo src={cursorPng} alt="Cursor" />,
      name: 'Cursor',
      desc: 'Writes a global config to ~/.cursor/mcp.json.',
    },
    {
      client: 'antigravity',
      logo: <ClientLogo src={antigravityPng} alt="Antigravity" />,
      name: 'Antigravity',
      desc: 'Writes a global config to ~/.gemini/antigravity/mcp_config.json.',
    },
  ];
}

function ClientLogo({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      aria-hidden
      style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'contain', flex: '0 0 auto', background: theme.panel, border: `0.5px solid ${theme.borderLight}` }}
    />
  );
}

function connectErrorMessage(t: ReturnType<typeof useT>, error: string): string {
  if (error === 'config-parse-error') return t('Target config file is not valid JSON; nothing was written to avoid overwriting it.');
  if (error === 'config-write-error') return t('Failed to write the config file.');
  if (error === 'codex-cli-failed') return t('Running codex mcp add failed.');
  return t('Connect failed');
}

function ConnectButton({ client, onStatus }: { client: ClientSnippet['client']; onStatus: (message: string, ok: boolean) => void }) {
  const t = useT();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const busy = state === 'busy';
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setState('busy');
        onStatus('', true);
        void fetch('/api/external-agent/connect-client', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client }),
        })
          .then(async (response) => {
            const data: unknown = await response.json().catch(() => null);
            const result = data as { ok?: boolean; paths?: string[]; error?: string } | null;
            if (response.ok && result?.ok) {
              setState('done');
              onStatus(t('Wrote {paths}', { paths: (result.paths ?? []).join('、') }), true);
              setTimeout(() => setState('idle'), 2500);
            } else {
              setState('error');
              onStatus(connectErrorMessage(t, result?.error ?? ''), false);
            }
          })
          .catch(() => {
            setState('error');
            onStatus(connectErrorMessage(t, ''), false);
          });
      }}
      style={{
        flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 10px', border: '0.5px solid transparent', borderRadius: 5,
        background: state === 'error' ? theme.hover : `linear-gradient(135deg, ${theme.accent}, ${theme.accentDeep})`,
        boxShadow: state === 'error' ? 'none' : themeAlpha.shadow(0.25),
        color: state === 'error' ? theme.danger : theme.onAccent,
        fontSize: 11, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.7 : 1,
      }}
    >
      <Icon name={state === 'done' ? 'check' : 'plug'} size={11} />
      {busy ? t('Connecting…') : state === 'done' ? t('Connected') : state === 'error' ? t('Connect failed') : t('Connect')}
    </button>
  );
}

const cardStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8,
  background: theme.panelAlt, border: `0.5px solid ${theme.borderLight}`,
  borderRadius: 8, padding: '10px 12px',
};

const endpointStyle: React.CSSProperties = {
  margin: 0, padding: '6px 9px', border: `0.5px solid ${theme.borderLight}`, borderRadius: 4,
  background: theme.inset, color: theme.textMuted, fontSize: 11.5, lineHeight: 1.5,
  fontFamily: 'Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
  whiteSpace: 'nowrap', overflowX: 'auto', userSelect: 'text',
};

export function McpGuideDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const endpoint = `${window.location.origin}/api/external-mcp/mcp`;
  const [mcpToken, setMcpToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState(false);
  const [connectStatus, setConnectStatus] = useState<Record<string, { message: string; ok: boolean }>>({});
  useEffect(() => {
    let active = true;
    void editorBootstrapInfo().then(
      (info) => { if (active) setMcpToken(info.mcpToken); },
      () => { if (active) setTokenError(true); },
    );
    return () => { active = false; };
  }, []);
  return (
    <div className="cc-modal-backdrop" onPointerDown={onClose}>
      <div
        className="cc-modal"
        style={{ width: 600, gap: 12, maxHeight: 'calc(100vh - 64px)', overflowY: 'auto' }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            aria-hidden
            style={{
              width: 36, height: 36, borderRadius: 10, flex: '0 0 auto',
              background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentDeep})`,
              boxShadow: themeAlpha.shadow(0.35),
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: theme.onAccent,
            }}
          >
            <Icon name="plug" size={18} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <strong style={{ fontSize: 14 }}>{t('External agents (MCP)')}</strong>
            <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
              {t('Streamable HTTP · shares the editing tools with the built-in Agent')}
            </span>
          </div>
          <button type="button" onClick={onClose} style={{ marginLeft: 'auto', padding: '3px 9px' }}>{t('Close')}</button>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{t('Endpoint')}</span>
            <span style={{ color: theme.textMuted, fontSize: 11.5 }}>{t('One endpoint shared by every client')}</span>
          </div>
          <pre style={endpointStyle}>{endpoint}</pre>
        </div>

        {mcpToken ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {clientSnippets().map((snippet) => (
              <div key={snippet.name} style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {snippet.logo}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{snippet.name}</span>
                    <span style={{ color: theme.textMuted, fontSize: 11.5 }}>{t(snippet.desc)}</span>
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <ConnectButton
                      client={snippet.client}
                      onStatus={(message, ok) => setConnectStatus((prev) => ({ ...prev, [snippet.client]: { message, ok } }))}
                    />
                  </div>
                </div>
                {connectStatus[snippet.client]?.message ? (
                  <div style={{ color: connectStatus[snippet.client].ok ? theme.accent : theme.danger, fontSize: 11 }}>
                    {connectStatus[snippet.client].message}
                  </div>
                ) : null}
              </div>
            ))}
            <div style={{ color: theme.textDim, fontSize: 11 }}>
              {t('Restart the client after connecting; Codex needs a new terminal for the env var.')}
            </div>
          </div>
        ) : (
          <div style={{ color: tokenError ? theme.danger : theme.textMuted, fontSize: 12 }}>
            {tokenError ? t('Could not load the MCP connection token. Retry from a trusted editor window.') : t('Loading the MCP connection token…')}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={cardStyle}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{t('Built-in Agent vs external MCP')}</span>
            <div style={{ color: theme.textMuted, fontSize: 12, lineHeight: 1.55 }}>
              {t('The built-in Agent creates a previewable proposal for you to apply or reject. External MCP uses an isolated edit session: manual mode waits for review, while auto mode applies during review. Both modify projects only through EditorCore commands.')}
            </div>
          </div>
          <div style={cardStyle}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{t('Connect a local model')}</span>
            <div style={{ color: theme.textMuted, fontSize: 12, lineHeight: 1.55 }}>
              {t('Open Settings → Agent Model → Agent Brain → OpenAI, enter the API URL and model for your local or compatible service, choose Responses API or Chat Completions API as required, then click “Test and load models.” Enter an API key only if the service requires one.')}
            </div>
          </div>
        </div>

        <div style={{ color: theme.textDim, fontSize: 11.5, lineHeight: 1.55, borderTop: `0.5px solid ${theme.borderLight}`, paddingTop: 8 }}>
          {t('The MCP endpoint always requires a bearer token. The token is generated on first launch and kept on this machine, so it stays the same across restarts: registering once keeps working; the OPENCHATCUT_MCP_TOKEN environment variable overrides it. The token is shown only in the current trusted editor session and is never written to the project, chat, or browser storage.')}
        </div>
      </div>
    </div>
  );
}
