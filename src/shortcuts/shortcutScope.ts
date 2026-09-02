export type ShortcutSurface =
  | 'media-pool'
  | 'timeline'
  | 'inspector'
  | 'other';

const PROJECT_SHORTCUTS = new Set([
  'undo',
  'redo',
  'save-version',
  'keyboard-shortcuts',
]);

/**
 * The Final Cut edit keys act on the card selected in the Library, so they have
 * to fire while focus is still in the Library — clicking a card is what selects
 * it, and asking the user to click back into the timeline first would defeat
 * the point. They are safe everywhere: they do nothing at all unless a library
 * item is selected, and like every other bare-letter action they are ignored
 * while something is being typed.
 */
const LIBRARY_SHORTCUTS = new Set([
  'library-append',
  'library-insert',
  'library-connect',
]);

export function shortcutAllowedForSurface(actionId: string, surface: ShortcutSurface): boolean {
  if (PROJECT_SHORTCUTS.has(actionId)) return true;
  if (LIBRARY_SHORTCUTS.has(actionId)) return true;
  return surface === 'timeline';
}

export function shortcutSurfaceFromTarget(target: EventTarget | null): ShortcutSurface {
  if (!(target instanceof Element)) return 'other';
  const surface = target.closest<HTMLElement>('[data-cc-shortcut-surface]')?.dataset.ccShortcutSurface;
  if (
    surface === 'media-pool'
    || surface === 'timeline'
    || surface === 'inspector'
  ) return surface;
  return 'other';
}
