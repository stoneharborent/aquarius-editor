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
import { showAppToast } from '../ui/appToast';
import { useHyperframes } from './HyperframesContext';
import { hyperframesAcceptsPrompts } from './api';
import { HyperframesSetupCard } from './HyperframesSetupCard';
import { HyperframesSetup } from './HyperframesSetup';
import { HyperframesPromptPopup } from './HyperframesPromptPopup';
import {
  formatHyperframeTimestamp, hyperframeTemplate,
  type HyperframeRecord, type PendingHyperframe,
} from './records';

/** The card whose Regenerate button opened the revise popup, and where it sits. */
interface RevisingTarget {
  readonly record: HyperframeRecord;
  readonly x: number;
  readonly y: number;
}

export function HyperframesPanel() {
  const t = useT();
  const hyperframes = useHyperframes();
  const [prompt, setPrompt] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [revising, setRevising] = useState<RevisingTarget | null>(null);
  // Two-step delete, the same shape the media pool and the template browser
  // use: the first click arms the card, the second one does it.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const config = hyperframes.config;
  const unconfigured = config !== null && !config.configured;
  // The setup card still shows while the built-in model downloads, but the
  // prompt bar stays live: pressing Generate then answers "still downloading"
  // instead of refusing to accept a keystroke for several minutes.
  const canPrompt = hyperframesAcceptsPrompts(config);
  // The bundled model already generates, so the setup card is an offer, not a
  // gate: it stays folded away behind a link until someone asks for it.
  const builtin = config?.builtin === true;

  const submit = () => {
    const trimmed = prompt.trim();
    if (!trimmed || !canPrompt) return;
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
            disabled={!canPrompt}
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
            disabled={!canPrompt || !prompt.trim()}
            style={{
              flex: '0 0 auto',
              border: 'none',
              borderRadius: 5,
              background: prompt.trim() && canPrompt ? theme.accent : theme.inset,
              color: prompt.trim() && canPrompt ? theme.onAccent : theme.textDim,
              cursor: prompt.trim() && canPrompt ? 'pointer' : 'default',
              fontSize: 11.5,
              fontWeight: 600,
              padding: '0 13px',
            }}
          >
            {t('Generate')}
          </button>
        </div>
        {unconfigured && (
          <HyperframesSetup
            compact
            problem={config?.problem}
            onConfigured={hyperframes.refreshConfig}
          />
        )}
        {builtin && !showUpgrade && (
          <button
            type="button"
            onClick={() => setShowUpgrade(true)}
            style={{
              alignSelf: 'flex-start',
              border: 'none',
              background: 'none',
              color: theme.textDim,
              cursor: 'pointer',
              fontSize: 10.5,
              padding: 0,
              textAlign: 'left',
            }}
          >
            {t('Generating with the built-in model · use a stronger one')}
          </button>
        )}
        {builtin && showUpgrade && (
          <HyperframesSetupCard
            compact
            upgrade
            onSaved={() => {
              setShowUpgrade(false);
              hyperframes.refreshConfig();
            }}
          />
        )}
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
                originName={record.referenceId
                  ? hyperframes.records.find((other) => other.id === record.referenceId)?.name
                  : undefined}
                clips={hyperframes.clipCount(record)}
                confirmingDelete={confirmDeleteId === record.id}
                onHover={setHoveredId}
                // Clicking the picture PLACES a clip. Saying so is what stops
                // the next step — Delete going grey because a clip now uses the
                // graphic — from looking like a broken button.
                onInsert={() => {
                  hyperframes.insertAtPlayhead(record);
                  showAppToast(t('Added {name} at the playhead', { name: record.name }));
                }}
                onRegenerate={(at) => {
                  setConfirmDeleteId(null);
                  setRevising({ record, x: at.x, y: at.y });
                }}
                onRename={(name) => hyperframes.rename(record, name)}
                onRemove={() => {
                  if (confirmDeleteId !== record.id) {
                    setConfirmDeleteId(record.id);
                    return;
                  }
                  setConfirmDeleteId(null);
                  hyperframes.remove(record);
                }}
                onCancelRemove={() => setConfirmDeleteId(null)}
              />
            ))}
          </div>
        )}
      </div>

      {revising && (
        <HyperframesPromptPopup
          x={revising.x}
          y={revising.y}
          configured={canPrompt}
          problem={config?.problem}
          initialPrompt={revising.record.prompt}
          reviseFrom={revising.record.name}
          onSubmit={(nextPrompt, notes) => hyperframes.revise(revising.record, nextPrompt, notes)}
          onClose={() => setRevising(null)}
          onConfigured={hyperframes.refreshConfig}
        />
      )}
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
        {run.reference && (
          <span style={originLine} title={run.reference.name}>
            {t('Revised from {name}', { name: run.reference.name })}
          </span>
        )}
        {run.notes && <span style={notesLine} title={run.notes}>{run.notes}</span>}
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

function HyperframeCard({
  record, fps, hovered, originName, clips, confirmingDelete,
  onHover, onInsert, onRegenerate, onRename, onRemove, onCancelRemove,
}: {
  record: HyperframeRecord;
  fps: number;
  hovered: boolean;
  /** Name of the generation this one was revised from, when it is still around. */
  originName?: string;
  /**
   * How many timeline clips are made from this generation. Zero — the case for
   * every graphic nobody has placed yet — leaves Delete live.
   */
  clips: number;
  confirmingDelete: boolean;
  onHover: (id: string | null) => void;
  onInsert: () => void;
  onRegenerate: (at: { x: number; y: number }) => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  onCancelRemove: () => void;
}) {
  const t = useT();
  // Renaming happens INSIDE the card. `window.prompt` is not implemented in
  // Electron — it throws instead of opening a dialog — so the old prompt-based
  // Rename button did nothing at all in the desktop app.
  const [draftName, setDraftName] = useState<string | null>(null);
  const renaming = draftName !== null;
  const commitRename = () => {
    if (draftName === null) return;
    setDraftName(null);
    onRename(draftName);
  };
  const placed = clips > 0;
  const placedReason = clips > 1
    ? t('This graphic is used by {n} clips on the timeline. Delete them first.', { n: clips })
    : t('This graphic is used by a clip on the timeline. Delete the clip first.');
  return (
    <article
      className="cc-hyperframes-card"
      // A draggable ancestor swallows the pointer selection an <input> needs, so
      // the card stops being draggable while its name is being edited.
      draggable={!renaming}
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
        {renaming ? (
          <input
            type="text"
            autoFocus
            value={draftName}
            aria-label={t('Rename graphic')}
            onChange={(event) => setDraftName(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            // Timeline shortcuts listen on the window; a name being typed here
            // must never reach them.
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter') { event.preventDefault(); commitRename(); }
              if (event.key === 'Escape') { event.preventDefault(); setDraftName(null); }
            }}
            onBlur={commitRename}
            style={{
              border: `0.5px solid ${theme.accent}`,
              borderRadius: 4,
              background: theme.inset,
              color: theme.text,
              fontSize: 11.5,
              minWidth: 0,
              padding: '2px 4px',
            }}
          />
        ) : (
          <span style={cardName} title={record.prompt}>{record.name}</span>
        )}
        {record.referenceId && (
          <span style={originLine}>
            {originName
              ? t('Revised from {name}', { name: originName })
              : t('Revised from an earlier graphic')}
          </span>
        )}
        {record.notes && <span style={notesLine} title={record.notes}>{record.notes}</span>}
        <span style={{ fontSize: 10, color: theme.textDim }}>{formatHyperframeTimestamp(record.createdAt)}</span>
      </div>
      <div style={{ display: 'flex', gap: 5, padding: '0 6px 7px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            onRegenerate({ x: rect.left, y: rect.bottom + 4 });
          }}
          style={miniButton}
        >{t('Regenerate')}</button>
        <button
          type="button"
          onClick={() => setDraftName(record.name)}
          style={miniButton}
        >{t('Rename')}</button>
        {placed ? (
          // A disabled button fires no pointer events, so its own `title` never
          // becomes a tooltip: the reason hangs on the wrapper instead, and is
          // repeated in plain sight under the row.
          <span title={placedReason} style={{ display: 'inline-flex' }}>
            <button
              type="button"
              disabled
              title={placedReason}
              style={{ ...miniButton, color: theme.textDim, cursor: 'default' }}
            >{t('Delete')}</button>
          </span>
        ) : (
          <button
            type="button"
            onClick={onRemove}
            style={{ ...miniButton, color: theme.danger }}
          >{confirmingDelete ? t('Confirm Delete') : t('Delete')}</button>
        )}
        {confirmingDelete && !placed && (
          <button
            type="button"
            onClick={onCancelRemove}
            style={{ ...miniButton, color: theme.textDim }}
          >{t('Cancel')}</button>
        )}
      </div>
      {placed && (
        <div style={{ fontSize: 10, color: theme.gold, lineHeight: 1.35, padding: '0 6px 7px' }}>
          {placedReason}
        </div>
      )}
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
const originLine: React.CSSProperties = {
  fontSize: 10,
  color: theme.textDim,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
const notesLine: React.CSSProperties = {
  fontSize: 10,
  color: theme.textDim,
  lineHeight: 1.35,
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
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
