// The floating prompt the timeline opens at the click point, and the same
// popup the Library tab opens when a finished graphic is revised.
//
// Presentational on purpose: the caller owns where it sits and what submitting
// means, this owns the typing. Enter submits and closes; the notice tells the
// user the clip will drop itself in when the model is done.
//
// In revise mode the brief arrives pre-filled and editable, and a second field
// asks what should change. The two are separate on purpose: the brief is what
// the graphic is, the notes are what is wrong with the one that exists — a
// model given both edits, while a model given one merged paragraph rewrites.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { theme, themeAlpha } from '../theme';
import { useT } from '../i18n/locale';
import { HyperframesSetup } from './HyperframesSetup';
import type { HyperframesProblem } from './api';

export interface HyperframesPromptPopupProps {
  x: number;
  y: number;
  /**
   * Timecode label for the frame that was right-clicked. Absent when the popup
   * was opened from the Library tab, where there is no spot to drop into.
   */
  atLabel?: string;
  configured: boolean;
  /** Why the bundled model is unusable, when it is. */
  problem?: HyperframesProblem;
  /** Pre-fills the brief. Revising starts from the original, editable. */
  initialPrompt?: string;
  /** Name of the graphic being revised; switches the popup into revise mode. */
  reviseFrom?: string;
  onSubmit: (prompt: string, notes: string) => void;
  onClose: () => void;
  onConfigured: () => void;
}

const WIDTH = 296;

export function HyperframesPromptPopup({
  x, y, atLabel, configured, problem, initialPrompt, reviseFrom,
  onSubmit, onClose, onConfigured,
}: HyperframesPromptPopupProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [notes, setNotes] = useState('');
  const [pos, setPos] = useState({ left: x, top: y });
  const revising = typeof reviseFrom === 'string';

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    });
    inputRef.current?.focus();
  }, [x, y, configured]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const submit = () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    onSubmit(trimmed, notes.trim());
    onClose();
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t('Hyperframes')}
      className="cc-hyperframes-prompt"
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: WIDTH,
        zIndex: 260,
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        padding: 10,
        border: `0.5px solid ${theme.borderLight}`,
        borderRadius: 6,
        background: theme.panel,
        boxShadow: `0 12px 32px ${themeAlpha.shadow(0.5)}`,
      }}
    >
      <div style={{ fontSize: 11.5, fontWeight: 600, color: theme.text }}>
        {revising ? t('Regenerate graphic') : t('Hyperframes')}
      </div>
      {configured && revising && (
        <div style={{ fontSize: 10.5, color: theme.textDim, lineHeight: 1.4 }}>
          {t('Based on {name}. The original is kept — this makes a new graphic.', { name: reviseFrom })}
        </div>
      )}
      {configured ? (
        <>
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            placeholder={t('Describe the graphic you want…')}
            aria-label={t('Describe the graphic you want…')}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
              event.preventDefault();
              submit();
            }}
            style={{
              border: `0.5px solid ${theme.border}`,
              borderRadius: 4,
              background: theme.inset,
              color: theme.text,
              fontSize: 12,
              padding: '7px 9px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
          {revising && (
            <textarea
              value={notes}
              rows={3}
              placeholder={t('What should change?')}
              aria-label={t('What should change?')}
              onChange={(event) => setNotes(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
                event.preventDefault();
                submit();
              }}
              style={{
                border: `0.5px solid ${theme.border}`,
                borderRadius: 4,
                background: theme.inset,
                color: theme.text,
                fontSize: 12,
                padding: '7px 9px',
                width: '100%',
                boxSizing: 'border-box',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          )}
          <div style={{ fontSize: 10.5, color: theme.textDim, lineHeight: 1.4 }}>
            {revising
              ? t('The original graphic and its brief are sent as the reference, so the model edits it instead of starting over.')
              : atLabel
                ? t('Press Enter to generate. The clip drops in at {at} when it is ready, and is saved to the Hyperframes tab.', { at: atLabel })
                : t('Press Enter to generate. The graphic is saved to the Hyperframes tab when it is ready.')}
          </div>
          {revising && (
            <button
              type="button"
              onClick={submit}
              disabled={!prompt.trim()}
              style={{
                alignSelf: 'flex-start',
                border: 'none',
                borderRadius: 4,
                background: prompt.trim() ? theme.accent : theme.inset,
                color: prompt.trim() ? theme.onAccent : theme.textDim,
                cursor: prompt.trim() ? 'pointer' : 'default',
                fontSize: 11,
                fontWeight: 600,
                padding: '5px 12px',
              }}
            >
              {t('Generate')}
            </button>
          )}
        </>
      ) : (
        <HyperframesSetup compact problem={problem} onConfigured={onConfigured} />
      )}
    </div>
  );
}
