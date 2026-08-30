// One pane inside the body of a settings tab: heading, explanatory note,
// fields, and — for the local-model panes — the installer UI underneath.
import { useT } from '../../i18n/locale';
import { Icon } from '../icons';
import { FieldRow, type FieldCtx } from './SettingsFieldRow';
import { LocalAsrPane } from './LocalAsrPane';
import { LocalModelPackPane } from './LocalModelPackPane';
import { SemanticModelPackPane } from './SemanticModelPackPane';
import type { SettingsPane } from './settingsSchema';
import { pageNote, paneCard, paneHead } from './settingsPane.styles';

function PaneBody({ pane, ctx }: { pane: SettingsPane; ctx: FieldCtx }) {
  if (pane.key === 'local/asr') return <LocalAsrPane fields={pane.fields} ctx={ctx} />;
  if (pane.key === 'local/music/packs') {
    return (
      <LocalModelPackPane
        packIds={['rhythm-lite', 'music-semantics-lite']}
        title="Beat and music analysis models"
        description="Built in and ready to use — beat and music-semantic analysis runs on this machine."
      />
    );
  }
  if (pane.key === 'local/semantic/setup') return <SemanticModelPackPane />;
  return null;
}

export function SettingsPaneView({ pane, ctx }: { pane: SettingsPane; ctx: FieldCtx }) {
  const t = useT();
  const custom = pane.kind === 'local-models';
  return (
    <section style={paneCard} aria-label={t(pane.title)}>
      <div style={paneHead}>
        {pane.icon && <Icon name={pane.icon} size={15} />}
        <span>{t(pane.title)}</span>
      </div>
      {pane.note && <div style={{ ...pageNote, marginTop: 5 }}>{t(pane.note)}</div>}
      {!custom && pane.fields.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 11 }}>
          {pane.fields.map((field) => <FieldRow key={field.name} field={field} ctx={ctx} />)}
        </div>
      )}
      {custom && <div style={{ marginTop: 11 }}><PaneBody pane={pane} ctx={ctx} /></div>}
    </section>
  );
}
