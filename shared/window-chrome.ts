// Window chrome contract: renderer ⇄ main-process wire types for the app-drawn
// titlebar. The renderer paints the bar and reports its height and skin colours;
// the main process places whatever native chrome sits on top (macOS traffic
// lights, the Windows Controls Overlay) and reports back whether the window is
// maximized or full screen so the bar can draw the right restore icon.
//
// Plain JSON, structured-cloned, and validated at the main-process boundary like
// every other renderer-provided input. Geometry math lives in
// desktop/window-frame.ts; this file is only the shape of the messages.

export interface DesktopWindowChrome {
  /** Painted titlebar height in CSS pixels. */
  titlebarHeight: number;
  /** The skin's chrome surface (`--cc-panel`) as #rrggbb. */
  color: string;
  /** The ink on that surface (`--cc-text`) as #rrggbb. */
  symbolColor: string;
}

export interface DesktopWindowState {
  maximized: boolean;
  fullScreen: boolean;
}

export const WINDOW_CHROME_CHANNELS = {
  /** renderer → main: "this is the bar I am painting". */
  setChrome: 'openchatcut:window-chrome',
  /** renderer → main: read the current maximize/full-screen state once, on mount. */
  readState: 'openchatcut:window-state',
  /** main → renderer: the state changed. */
  stateChanged: 'openchatcut:window-state-changed',
} as const;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
/** Nothing legitimate paints a titlebar taller than this; reject the rest. */
const MAX_TITLEBAR_HEIGHT = 200;

export function isDesktopWindowChrome(value: unknown): value is DesktopWindowChrome {
  if (typeof value !== 'object' || value === null) return false;
  const chrome = value as Record<string, unknown>;
  return typeof chrome.titlebarHeight === 'number'
    && Number.isFinite(chrome.titlebarHeight)
    && chrome.titlebarHeight > 0
    && chrome.titlebarHeight <= MAX_TITLEBAR_HEIGHT
    && typeof chrome.color === 'string' && HEX_COLOR.test(chrome.color)
    && typeof chrome.symbolColor === 'string' && HEX_COLOR.test(chrome.symbolColor);
}

export function isDesktopWindowState(value: unknown): value is DesktopWindowState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Record<string, unknown>;
  return typeof state.maximized === 'boolean' && typeof state.fullScreen === 'boolean';
}
