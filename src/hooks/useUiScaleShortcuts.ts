import { useEffect } from 'react';

const ZOOM_STEP = 0.05;

/**
 * Desktop UI-scale accelerators (issue #85): Mod + Alt + Plus/Minus steps the
 * saved UI scale by 5% (clamped 80%–150% in the main process), Mod + Alt + 0
 * resets to 100%. Ignored while typing and when no desktop bridge exists —
 * browsers keep their own zoom shortcuts.
 *
 * Why Alt is required (bench, 2026-09-01). These used to be plain Mod + =/-/0,
 * which collided with `zoom-in` / `zoom-out` in the shortcut catalog — Final
 * Cut's timeline zoom, and the law per CLAUDE.md rule 4. The collision was
 * invisible until v0.7.0: Electron's default File/Edit menu owned Mod + =/-/0
 * as menu accelerators, which are handled before the page sees a key, so
 * NEITHER behaviour fired on Linux or Windows. Removing that menu let the keys
 * through and this listener — global, on `window`, and calling preventDefault —
 * won every time, so timeline zoom was unreachable by keyboard and the timeline
 * toolbar's own "Zoom in timeline (⌘＋)" tooltip was a lie. Royce's call: the
 * timeline keeps the Final Cut chords, and UI scale (which has no Final Cut
 * equivalent) moves. Not Mod + Shift + =, because that IS ⌘+ on a US layout and
 * is already `zoom-in`'s second binding.
 *
 * Matching is by `event.code`, not `event.key`: with Alt held, macOS turns
 * Option + = into "≠" and Option + - into "–", so the printed character is
 * useless here.
 */
export function useUiScaleShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      // Without Alt these chords belong to the timeline (zoom-in / zoom-out).
      if (!event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const desktop = window.openChatCutDesktop;
      if (!desktop?.zoomStep) return;
      const code = event.code;
      if (code === 'Equal' || code === 'NumpadAdd') {
        event.preventDefault();
        void desktop.zoomStep(ZOOM_STEP);
      } else if (code === 'Minus' || code === 'NumpadSubtract') {
        event.preventDefault();
        void desktop.zoomStep(-ZOOM_STEP);
      } else if (code === 'Digit0' || code === 'Numpad0') {
        event.preventDefault();
        void desktop.zoomStep('reset');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
