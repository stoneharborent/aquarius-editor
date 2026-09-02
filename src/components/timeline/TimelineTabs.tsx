import { useEffect, useRef, useState } from 'react';
import { theme, themeAlpha } from '../../theme';
import { ratioLabel, type ProjectDoc } from '../../editor/types';
import type { EditorCommands } from '../../editor/store';
import { useT } from '../../i18n/locale';
import { Icon } from '../icons';
import { usePublishTimelineChromeHeight } from './timelinePanelHeight';

/** Fixed strip height: 4px padding + a 25px tab + 4px padding. Enforced by the
 *  style below so the editor's panel layout can budget for it exactly. */
export const TIMELINE_TABS_STRIP_HEIGHT = 33;

interface TimelineTabsProps {
  doc: ProjectDoc;
  commands: EditorCommands;
}

/** Bottom sequence-tab bar: switch / add / rename /
 * duplicate / delete timelines, plus a one-click 9:16 vertical copy for
 * long→short retargeting. */
export function TimelineTabs({ doc, commands }: TimelineTabsProps) {
  const t = useT();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (renaming) inputRef.current?.select(); }, [renaming]);

  const timelines = doc.timelines.filter((t) => !t.hidden).sort((a, b) => a.order - b.order);
  const commitRename = () => {
    if (renaming && draft.trim()) commands.renameTimeline(renaming, draft.trim());
    setRenaming(null);
  };

  // The strip shares the timeline's grid row, so the panel height has to budget
  // for it — otherwise it would eat into the inch under the last track.
  const visible = timelines.length > 1;
  usePublishTimelineChromeHeight(visible ? TIMELINE_TABS_STRIP_HEIGHT : 0);

  if (!visible) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: TIMELINE_TABS_STRIP_HEIGHT, boxSizing: 'border-box', padding: '4px 8px', borderTop: `0.5px solid ${theme.border}`, background: theme.panel, overflowX: 'auto', flexShrink: 0 }}>
      {timelines.map((tl) => {
        const active = tl.id === doc.activeTimelineId;
        return (
          <div
            key={tl.id}
            onClick={() => !active && commands.switchTimeline(tl.id)}
            onDoubleClick={() => { setRenaming(tl.id); setDraft(tl.name); }}
            title={t('Click to switch · double-click to rename')}
            style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 4, cursor: 'pointer', flexShrink: 0,
              background: active ? themeAlpha.accent(0.14) : 'transparent',
              border: `0.5px solid ${active ? theme.accent : theme.border}`,
              color: active ? theme.text : theme.textDim,
            }}
          >
            {renaming === tl.id ? (
              <input
                ref={inputRef}
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={commitRename}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                style={{ width: 88, background: theme.bg, color: theme.text, border: `0.5px solid ${theme.borderLight}`, borderRadius: 4, padding: '1px 4px', fontSize: 12, fontFamily: 'inherit' }}
              />
            ) : (
              <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{tl.name}</span>
            )}
            <span style={{ fontSize: 10, color: theme.textDim, fontVariantNumeric: 'tabular-nums', background: theme.bg, borderRadius: 4, padding: '0 4px' }}>{ratioLabel(tl.width, tl.height)}</span>
            {timelines.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); commands.deleteTimeline(tl.id); }}
                title={t('Delete this sequence')}
                style={{ background: 'none', border: 'none', color: theme.textDim, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}
              >×</button>
            )}
          </div>
        );
      })}
      <span style={{ width: 6 }} />
      <button onClick={() => commands.createTimeline()} title={t('New sequence')} style={tabBtn}>{t('＋ Sequence')}</button>
      <button onClick={() => commands.duplicateTimeline(doc.activeTimelineId)} title={t('Duplicate current sequence')} style={{ ...tabBtn, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="copy" size={13} />{t('Copy')}</button>
      <button
        onClick={() => commands.duplicateTimeline(doc.activeTimelineId, { retarget: { width: 1080, height: 1920, fit: 'cover' }, name: 'Vertical' })}
        title={t('Duplicate the current sequence as a 9:16 vertical (long-to-short)')}
        style={{ ...tabBtn, display: 'inline-flex', alignItems: 'center', gap: 4 }}
      ><Icon name="swap" size={13} />{t('Vertical copy')}</button>
    </div>
  );
}

const tabBtn: React.CSSProperties = {
  background: 'none', border: `0.5px solid ${theme.border}`, color: theme.textDim, cursor: 'pointer',
      fontSize: 12, borderRadius: 4, padding: '4px 8px', whiteSpace: 'nowrap', flexShrink: 0,
};
