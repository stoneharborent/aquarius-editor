// Accelerators that used to belong to the application menu.
//
// app-menu.ts removes the menu on Linux and Windows and drops the View menu on
// macOS, so the handful of window-level shortcuts those menus carried have to be
// handled here instead, on the window's own key stream. Everything else the menus
// provided either lives in the app already (undo/redo/zoom in the top bar and the
// shortcut catalog, cut/copy/paste in Chromium and the right-click menu in
// context-menu.ts) or was deliberately dropped — see app-menu.ts for the audit:
//   Reload / Force Reload  dropped. Reloading mid-edit is a footgun, and on
//                          Windows/Linux the menu's Ctrl+R was shadowing the
//                          editor's own "Move right to boundary".
//   Zoom In/Out/Reset      already the app's: src/hooks/useUiScaleShortcuts.ts.
//   Minimize / Close       the titlebar's own buttons (and Alt+F4 / ⌘W on macOS).
//   About / Learn More     the version lives in Settings; the upstream link was
//                          electronjs.org and is simply gone.
//
// Keys are matched by physical `code`, never by `key`: ⌥I on macOS produces a dead
// key, and Ctrl+Shift+I reports "I" rather than "i".

export type DesktopWindowKeyAction = 'toggle-fullscreen' | 'toggle-devtools' | 'quit';

/** The subset of Electron's `Input` this decision needs. */
export interface DesktopKeyInput {
  type: string;
  code: string;
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

export interface DesktopWindowKeyContext {
  platform: NodeJS.Platform;
  /** DevTools accelerators only exist in an unpackaged (development) run. */
  devTools: boolean;
}

const bare = (input: DesktopKeyInput): boolean =>
  !input.control && !input.meta && !input.shift && !input.alt;

export function resolveWindowKeyAction(
  input: DesktopKeyInput,
  { platform, devTools }: DesktopWindowKeyContext,
): DesktopWindowKeyAction | null {
  if (input.type !== 'keyDown') return null;

  if (devTools) {
    if (input.code === 'F12' && bare(input)) return 'toggle-devtools';
    if (input.code === 'KeyI') {
      const macChord = platform === 'darwin' && input.meta && input.alt && !input.control;
      const pcChord = platform !== 'darwin' && input.control && input.shift && !input.meta;
      if (macChord || pcChord) return 'toggle-devtools';
    }
  }

  // macOS keeps Enter Full Screen (⌃⌘F) in its Window menu; F11 is the convention
  // on the other two platforms, and there is no menu there to provide it.
  if (platform !== 'darwin' && input.code === 'F11' && bare(input)) return 'toggle-fullscreen';

  // Ctrl+Q is how a GNOME app quits, and the removed File menu was where it lived.
  // Windows quits with Alt+F4 (the window manager's job) and never had Ctrl+Q.
  if (
    platform === 'linux'
    && input.code === 'KeyQ'
    && input.control && !input.meta && !input.shift && !input.alt
  ) return 'quit';

  return null;
}
