import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { theme } from '../../theme';
import { t, useT } from '../../i18n/locale';
import { Icon } from '../icons';
import { applyLiveCaps, applyLiveKeyStatus, applyLiveModels } from '../../agent/capabilities';
import { applyAgentModelStatus } from '../../agent/model-selection';
import {
  TRANSCRIPTION_LANGUAGE_KEY,
  setAutoTranscribeIngest,
  setPreferredTranscriptionProvider,
} from '../../transcript/provider';
import { isTranscriptionProviderId } from '../../transcript/types';
import { SettingsVersionControl } from './SettingsVersionControl';
import { SettingsTabBar } from './SettingsTabBar';
import { SettingsPaneView } from './SettingsPaneView';
import type { FieldCtx } from './SettingsFieldRow';
import {
  CURRENT_APP_VERSION,
  formatDisplayVersion,
  getUpstreamUpdateState,
  hasDesktopUpdateSupport,
  subscribeUpstreamUpdate,
  UPDATE_CHECKS_ENABLED,
} from '../../ui/upstreamUpdate';
import {
  resolveUpstreamUpdateAction,
  runUpstreamUpdateCommand,
} from '../../ui/upstreamUpdateAction';
import {
  SETTINGS_TABS, buildPatch, findTab, savedMessage,
  type KeyStatusResponse, type SettingsField, type StagedValues as Values,
} from './settingsSchema';
import { ON, WARN } from './settingsPane.styles';
import {
  bodyColumn, btnGhost, btnPrimary, code, foot, footMsg,
  head, iconBtn, licenseLink, overlay, panel, tabHint,
} from './SettingsDialog.styles';

// Global settings modal. Tabs run across the top of the window and the selected
// tab's panes fill the body below it.
//
// Values only ever flow to the local dev/desktop server through POST /api/keys
// (kept in memory + .env.local, which is gitignored) and are injected
// server-side. Nothing shown here is a secret: every field is a non-secret
// choice whose current value GET /api/keys echoes back through its `models`
// channel.
//
// values semantics: a field name present in `values` is a staged change;
// '' means "clear this key", which the backend turns into a deletion from
// .env.local — for these fields that reads as "return to the default".
const CLOSE_CONFIRM_MS = 2000;

// ── hooks ─────────────────────────────────────────────────────────────────

function useKeyStatus(): {
  status: KeyStatusResponse | null;
  setStatus: (s: KeyStatusResponse) => void;
  loadError: string | null;
} {
  const [status, setStatus] = useState<KeyStatusResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/keys')
      .then((r) => r.json() as Promise<KeyStatusResponse>)
      .then((d) => { if (alive) setStatus(d); })
      .catch(() => { if (alive) setLoadError(t('Could not load config (dev server not ready?)')); });
    return () => { alive = false; };
  }, []);
  return { status, setStatus, loadError };
}

/** Keep runtime transcription preferences in sync with server-saved settings. */
function syncTranscriptionPreferences(models: Record<string, string>): void {
  try {
    localStorage.setItem(TRANSCRIPTION_LANGUAGE_KEY, models.TRANSCRIPTION_LANGUAGE?.trim() || 'zh');
  } catch {
    // Best-effort; the runtime language default remains in effect.
  }
  // Transcription is a local-model feature now: the built-in Whisper engine is
  // the default, and a cloud provider only applies when set by hand in
  // .env.local.
  const provider = models.PREFERRED_TRANSCRIPTION_PROVIDER;
  setPreferredTranscriptionProvider(isTranscriptionProviderId(provider) ? provider : 'local');
  const ingest = models.AUTO_TRANSCRIBE_INGEST;
  if (ingest === 'off' || ingest === 'local' || ingest === 'all') setAutoTranscribeIngest(ingest);
}

/** Keep the runtime ASR model tier in sync with the saved setting ('' → auto). */
function syncLocalAsrModel(saved: string | undefined): void {
  try {
    if (saved === 'tiny' || saved === 'base' || saved === 'small' || saved === 'medium' || saved === '') {
      localStorage.setItem('cc.asrModel', saved ?? '');
    }
  } catch {
    // Best-effort; the auto tier stays in effect.
  }
}

function useSaveKeys(values: Values, onSaved: (next: KeyStatusResponse) => void): {
  save: () => Promise<void>; saving: boolean; msg: string | null; error: string | null;
} {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = async (): Promise<void> => {
    const patch = buildPatch(values);
    if (Object.keys(patch).length === 0) { setMsg(t('No changes')); return; }
    setSaving(true); setError(null); setMsg(null);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => ({})) as Partial<KeyStatusResponse> & { error?: string };
      if (!res.ok) throw new Error(body.error || t('Save failed ({n})', { n: res.status }));
      onSaved(body as KeyStatusResponse);
      setMsg(savedMessage());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };
  return { save, saving, msg, error };
}

/** Accidental-close guard: with unsaved changes the first Esc / backdrop click
 *  only warns; a second one within 2 seconds actually discards and closes. */
function useCloseGuard(dirty: boolean, onClose: () => void): { requestClose: () => void; warn: string | null } {
  const [warn, setWarn] = useState<string | null>(null);
  const armedAt = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const requestClose = (): void => {
    if (!dirty || Date.now() - armedAt.current < CLOSE_CONFIRM_MS) { onClose(); return; }
    armedAt.current = Date.now();
    setWarn(t('Unsaved changes — close again to discard them'));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setWarn(null); armedAt.current = 0; }, CLOSE_CONFIRM_MS);
  };
  return { requestClose, warn };
}

function useEscape(handler: () => void): void {
  const ref = useRef(handler);
  useEffect(() => { ref.current = handler; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') ref.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

// ── Main component ───────────────────────────────────────────────────────────

/** After a successful save, let the agent runtime see the new state immediately. */
function applySavedToAgent(next: KeyStatusResponse): void {
  applyLiveCaps(next.caps);
  applyLiveKeyStatus(next.keys);
  if (next.models) applyLiveModels(next.models);
  if (next.models) applyAgentModelStatus(next.keys, next.models);
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const updateState = useSyncExternalStore(
    subscribeUpstreamUpdate,
    getUpstreamUpdateState,
    getUpstreamUpdateState,
  );
  const { status, setStatus, loadError } = useKeyStatus();
  const [values, setValues] = useState<Values>({});
  const [tabKey, setTabKey] = useState<string>(SETTINGS_TABS[0].key);
  const tab = findTab(tabKey);
  useEffect(() => {
    if (!status?.models) return;
    syncTranscriptionPreferences(status.models);
    syncLocalAsrModel(status.models.LOCAL_ASR_MODEL);
  }, [status]);
  const { save, saving, msg, error } = useSaveKeys(values, (next) => {
    setStatus(next);
    // Desktop: the main process owns the zoom factor; re-apply after the
    // saved UI_SCALE changed so the change is visible immediately.
    void window.openChatCutDesktop?.windowAction('apply-ui-scale');
    applySavedToAgent(next);
    setValues({});
  });
  const ctx: FieldCtx = {
    status,
    values,
    onStage: (field: SettingsField, raw: string) => {
      setValues((previous) => ({ ...previous, [field.name]: raw }));
    },
  };
  const dirty = Object.keys(values).length > 0;
  const { requestClose, warn } = useCloseGuard(dirty, onClose);
  useEscape(requestClose);

  const updateAction = resolveUpstreamUpdateAction(updateState, hasDesktopUpdateSupport());

  const shownError = error ?? loadError;
  const message = shownError ? { text: shownError, color: WARN }
    : warn ? { text: warn, color: theme.gold }
      : msg ? { text: msg, color: ON } : null;

  return (
    <div style={overlay} onMouseDown={requestClose}>
      <div style={panel} onMouseDown={(e) => e.stopPropagation()}>
        <header style={head}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: theme.accent, display: 'inline-flex' }}><Icon name="sliders" size={15} /></span>
            <b style={{ fontSize: 14 }}>{t('Settings')}</b>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SettingsVersionControl
              versionLabel={t('Current version: {version}', { version: formatDisplayVersion(CURRENT_APP_VERSION) })}
              actionLabel={UPDATE_CHECKS_ENABLED ? updateAction.label : undefined}
              disabled={updateAction.disabled}
              onAction={() => { runUpstreamUpdateCommand(updateAction.command); }}
            />
            <button type="button" onClick={requestClose} title={t('Close')} style={iconBtn}><Icon name="x" size={15} /></button>
          </div>
        </header>
        <SettingsTabBar tabs={SETTINGS_TABS} activeKey={tab.key} onSelect={setTabKey} />
        <div style={bodyColumn}>
          <p style={tabHint}>{t(tab.hint)}</p>
          {tab.panes.map((pane) => <SettingsPaneView key={pane.key} pane={pane} ctx={ctx} />)}
          <p style={{ ...tabHint, marginTop: 2 }}>
            {t('Settings are stored in your local')} <code style={code}>.env.local</code>{t(' (gitignored) and injected by the server — ')}<b>{t('never sent to the browser.')}</b>
          </p>
        </div>
        <FooterBar message={message} dirty={dirty} saving={saving}
          onClose={requestClose} onSave={() => { void save(); }} />
      </div>
    </div>
  );
}

interface FooterBarProps {
  message: { text: string; color: string } | null;
  dirty: boolean; saving: boolean; onClose: () => void; onSave: () => void;
}

function FooterBar({ message, dirty, saving, onClose, onSave }: FooterBarProps) {
  const t = useT();
  const disabled = saving || !dirty;
  return (
    <footer style={foot}>
      <a href="/fonts/LICENSES.md" target="_blank" rel="noopener noreferrer" style={licenseLink}>
        {t('Third-party font licenses')}
      </a>
      <div style={{ ...footMsg, color: message?.color ?? ON }}>{message?.text ?? ''}</div>
      <button type="button" onClick={onClose} style={btnGhost}>{t('Close')}</button>
      <button type="button" onClick={onSave} disabled={disabled}
        style={{ ...btnPrimary, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' }}>
        {saving ? t('Saving…') : t('Save')}
      </button>
    </footer>
  );
}
