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

export function shortcutAllowedForSurface(actionId: string, surface: ShortcutSurface): boolean {
  if (PROJECT_SHORTCUTS.has(actionId)) return true;
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
