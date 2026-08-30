// Library → Hyperframes: an input bar over this project's generations.
//
// Cards reuse the motion-graphics card look (`cc-template-card`) and the live MG
// thumbnail (`MgThumb`) so a generated graphic previews exactly the way a stock
// template does, and they drag onto the timeline through the existing library
// `template` drop path.
import { useState } from 'react';
import { theme } from '../theme';
import { useT } from '../i18n/locale';
import { Icon } from '../components/icons';
import { MgThumb } from '../media/MgThumb';
import { setLibraryDrag } from '../library/drag';
import { useHyperframes } from './HyperframesContext';
import { HyperframesSetupCard } from './HyperframesSetupCard';
import {
  formatHyperframeTimestamp, hyperframeTemplate,
  type HyperframeRecord, type PendingHyperframe,
} from './records';

export function HyperframesPanel() {
  const t = useT();
  const hyperframes = useHyperframes();
  const [prompt, setPrompt] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const unconfigured = hyperframes.config !== null && !hyperframes.config.configured;

  const submit = () => {
    const trimmed = prompt.trim();
    if (!trimmed || unconfigured) return;
    hyperframes.generate(trimmed);
    setPrompt('');
  };

  const empty = !hyperframes.records.length && !hyperframes.pending.length;

  return (
    <div className="cc-hyperframes-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, borderTop: `0.5px solid ${theme.border}` }}>
      <div style={{ padding: '10px 12px', borderBottom: `0.5px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={prompt}
            disabled={unconfigured}
            placeholder={t('Describe the graphic you want…')}
            aria-label={t('Describe the graphic you want…')}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
              event.preventDefault();
              submit();
            }}
            style={{
              flex: 1,
              minWidth: 0,
              border: `0.5px solid ${theme.border}`,
              borderRadius: 5,
              background: theme.inset,
              color: theme.text,
              fontSize: 12,
              padding: '7px 9px',
            }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={unconfigured || !prompt.trim()}
            style={{
              flex: '0 0 auto',
              border: 'none',
              borderRadius: 5,
              background: prompt.trim() && !unconfigured ? theme.accent : theme.inset,
              color: prompt.trim() && !unconfigured ? theme.onAccent : theme.textDim,
              cursor: prompt.trim() && !unconfigured ? 'pointer' : 'default',
              fontSize: 11.5,
              fontWeight: 600,
              padding: '0 13px',
            }}
          >
            {t('Generate')}
          </button>
        </div>
        {unconfigured && <HyperframesSetupCard compact onSaved={hyperframes.refreshConfig} />}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '10px 10px 14px' }}>
        {empty ? (
          <div style={{ color: theme.textDim, fontSize: 12, lineHeight: 1.5, padding: '24px 10px', textAlign: 'center' }}>
            {t('No graphics yet. Describe one above, or right-click a timeline track and choose Hyperframes to generate one straight into the edit.')}
          </div>
        ) : (
          <div className="cc-hyperframes-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 10 }}>
            {hyperframes.pending.map((run) => (
              <PendingCard
                key={run.id}
                run={run}
                onRetry={() => hyperframes.retry(run)}
                onDismiss={() => hyperframes.dismiss(run.id)}
              />
            ))}
            {hyperframes.records.map((record) => (
              <HyperframeCard
                key={record.id}
                record={record}
                fps={hyperframes.fps}
                hovered={hoveredId === record.id}
                onHover={setHoveredId}
                onInsert={() => hyperframes.insertAtPlayhead(record)}
                onRegenerate={() => hyperframes.regenerate(record)}
                onRename={(name) => hyperframes.rename(record, name)}
                onRemove={() => hyperframes.remove(record)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PendingCard({ run, onRetry, onDismiss }: {
  run: PendingHyperframe;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const failed = run.status === 'failed';
  return (
    <article
      className="cc-hyperframes-card pending"
      data-status={run.status}
      style={{ ...cardShell, borderColor: failed ? theme.danger : theme.border }}
    >
      <div style={{ ...thumbShell, color: failed ? theme.danger : theme.textDim, gap: 6, flexDirection: 'column' }}>
        <Icon name={failed ? 'x' : 'sparkles'} size={22} />
        <span style={{ fontSize: 10.5 }}>{failed ? t('Failed') : t('Generating…')}</span>
      </div>
      <div style={cardMeta}>
        <span style={cardName} title={run.prompt}>{run.prompt}</span>
        {failed && run.error && (
          <span style={{ fontSize: 10, color: theme.danger, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{run.error}</span>
        )}
      </div>
      {failed && (
        <div style={{ display: 'flex', gap: 5, padding: '0 6px 7px' }}>
          <button type="button" onClick={onRetry} style={miniButton}>{t('Retry')}</button>
          <button type="button" onClick={onDismiss} style={{ ...miniButton, color: theme.textDim }}>{t('Dismiss')}</button>
        </div>
      )}
    </article>
  );
}

function HyperframeCard({ record, fps, hovered, onHover, onInsert, onRegenerate, onRename, onRemove }: {
  record: HyperframeRecord;
  fps: number;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onInsert: () => void;
  onRegenerate: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const t = useT();
  return (
    <article
      className="cc-hyperframes-card"
      draggable
      onDragStart={(event) => setLibraryDrag(event, {
        kind: 'template',
        id: record.id,
        name: record.name,
        data: hyperframeTemplate(record, fps),
      })}
      onPointerEnter={() => onHover(record.id)}
      onPointerLeave={() => onHover(null)}
      style={cardShell}
    >
      <button
        type="button"
        onClick={onInsert}
        title={t('Click to add at the playhead, or drag onto a track: {name}', { name: record.name })}
        style={{ ...thumbShell, border: 'none', padding: 0, cursor: 'pointer', width: '100%' }}
      >
        <MgThumb asset={record.asset} fps={fps} active={hovered} />
      </button>
      <div style={cardMeta}>
        <span style={cardName} title={record.prompt}>{record.name}</span>
        <span style={{ fontSize: 10, color: theme.textDim }}>{formatHyperframeTimestamp(record.createdAt)}</span>
      </div>
      <div style={{ display: 'flex', gap: 5, padding: '0 6px 7px' }}>
        <button type="button" onClick={onRegenerate} style={miniButton}>{t('Regenerate')}</button>
        <button
          type="button"
          onClick={() => {
            const next = window.prompt(t('Rename graphic'), record.name);
            if (next !== null) onRename(next);
          }}
          style={miniButton}
        >{t('Rename')}</button>
        <button type="button" onClick={onRemove} style={{ ...miniButton, color: theme.danger }}>{t('Delete')}</button>
      </div>
    </article>
  );
}

const cardShell: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  border: `0.5px solid ${theme.border}`,
  borderRadius: 6,
  background: theme.panelAlt,
  overflow: 'hidden',
};
const thumbShell: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  aspectRatio: '16 / 9',
  background: theme.inset,
  color: theme.textDim,
  overflow: 'hidden',
};
const cardMeta: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '6px 6px 5px',
  minWidth: 0,
};
const cardName: React.CSSProperties = {
  fontSize: 11.5,
  color: theme.text,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
const miniButton: React.CSSProperties = {
  border: `0.5px solid ${theme.border}`,
  borderRadius: 4,
  background: 'none',
  color: theme.text,
  cursor: 'pointer',
  fontSize: 10,
  padding: '3px 6px',
};
