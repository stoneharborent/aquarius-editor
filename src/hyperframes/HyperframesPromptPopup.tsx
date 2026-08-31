// The floating prompt the timeline opens at the click point.
//
// Presentational on purpose: the timeline owns where it sits and what submitting
// means, this owns the typing. Enter submits and closes; the notice tells the
// user the clip will drop itself in when the model is done.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { theme, themeAlpha } from '../theme';
import { useT } from '../i18n/locale';
import { HyperframesSetup } from './HyperframesSetup';
import type { HyperframesProblem } from './api';

export interface HyperframesPromptPopupProps {
  x: number;
  y: number;
  /** Timecode label for the frame that was right-clicked. */
  atLabel: string;
  configured: boolean;
  /** Why the bundled model is unusable, when it is. */
  problem?: HyperframesProblem;
  onSubmit: (prompt: string) => void;
  onClose: () => void;
  onConfigured: () => void;
}

const WIDTH = 296;

export function HyperframesPromptPopup({
  x, y, atLabel, configured, problem, onSubmit, onClose, onConfigured,
}: HyperframesPromptPopupProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState('');
  const [pos, setPos] = useState({ left: x, top: y });

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
    onSubmit(trimmed);
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
      <div style={{ fontSize: 11.5, fontWeight: 600, color: theme.text }}>{t('Hyperframes')}</div>
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
          <div style={{ fontSize: 10.5, color: theme.textDim, lineHeight: 1.4 }}>
            {t('Press Enter to generate. The clip drops in at {at} when it is ready, and is saved to the Hyperframes tab.', { at: atLabel })}
          </div>
        </>
      ) : (
        <HyperframesSetup compact problem={problem} onConfigured={onConfigured} />
      )}
    </div>
  );
}
