// The renderer half of the app-drawn window titlebar.
//
// The desktop shell has no native title bar and no menu bar (desktop/window-frame.ts,
// desktop/app-menu.ts): the app's own top bar IS the window's titlebar, painted in
// skin tokens so chrome and content read as one surface. This hook is what makes
// that bar behave like a titlebar:
//
//   • marks it draggable (the CSS class; interactive children opt out in index.css),
//   • reports its painted height and the live skin colours to the main process, so
//     the native controls that sit ON the bar — macOS traffic lights, the Windows
//     Controls Overlay — are placed and painted to match, and re-reported whenever
//     the skin changes,
//   • tracks maximized / full-screen state for the restore icon and the macOS
//     traffic-light inset,
//   • adds double-click-to-maximize on Linux, the one platform where Chromium does
//     not do it for a drag region by itself.
//
// In a browser there is no `openChatCutDesktop` bridge, so every branch here is
// inert and the header renders exactly as it did before.
import { useCallback, useEffect, useState } from 'react';
import { subscribeSkin } from '../skins';

export type DesktopChromePlatform = 'mac' | 'windows' | 'linux' | null;

/** Which chrome treatment a bridge platform gets (null = browser / unknown). */
export function desktopChromePlatform(platform: string | undefined): DesktopChromePlatform {
  if (platform === 'darwin') return 'mac';
  if (platform === 'win32') return 'windows';
  if (platform === 'linux') return 'linux';
  return null;
}

/** Expand `#abc`, lowercase, and reject anything that is not a plain hex colour. */
export function normalizeHexColor(value: string): string | null {
  const text = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  if (/^#[0-9a-f]{3}$/.test(text)) {
    return `#${[...text.slice(1)].map((c) => c + c).join('')}`;
  }
  return null;
}

/** The chrome surface and its ink, straight out of the live skin's CSS variables. */
function readSkinChromeColors(): { color: string; symbolColor: string } | null {
  if (typeof document === 'undefined') return null;
  const style = getComputedStyle(document.documentElement);
  const color = normalizeHexColor(style.getPropertyValue('--cc-panel'));
  const symbolColor = normalizeHexColor(style.getPropertyValue('--cc-text'));
  return color && symbolColor ? { color, symbolColor } : null;
}

export interface DesktopWindowChromeBinding {
  /** Class list for the titlebar element. */
  className: string;
  platform: DesktopChromePlatform;
  maximized: boolean;
  fullScreen: boolean;
  /** Double-click handler for the bar, or undefined where the OS already does it. */
  onDoubleClick?: (event: { target: EventTarget | null }) => void;
}

const INTERACTIVE = 'button, input, select, textarea, a, [contenteditable="true"], [data-cc-titlebar-control="true"]';

export function useDesktopWindowChrome(titlebarHeight: number): DesktopWindowChromeBinding {
  const desktop = typeof window === 'undefined' ? undefined : window.openChatCutDesktop;
  const platform = desktopChromePlatform(desktop?.platform);
  const [maximized, setMaximized] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    if (!desktop?.subscribeWindowState) return;
    let live = true;
    const apply = (state: { maximized: boolean; fullScreen: boolean }): void => {
      if (!live) return;
      setMaximized(state.maximized);
      setFullScreen(state.fullScreen);
    };
    const unsubscribe = desktop.subscribeWindowState(apply);
    void desktop.readWindowState().then(apply).catch(() => { /* window went away */ });
    return () => { live = false; unsubscribe(); };
  }, [desktop]);

  useEffect(() => {
    if (!desktop?.setWindowChrome) return;
    const push = (): void => {
      const colors = readSkinChromeColors();
      if (!colors) return;
      void desktop.setWindowChrome({ titlebarHeight, ...colors }).catch(() => { /* closing */ });
    };
    push();
    return subscribeSkin(push);
  }, [desktop, titlebarHeight]);

  const onDoubleClick = useCallback((event: { target: EventTarget | null }) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(INTERACTIVE)) return;
    void desktop?.windowAction('toggle-maximize');
  }, [desktop]);

  return {
    className: platform ? 'cc-window-titlebar cc-window-titlebar--desktop' : 'cc-window-titlebar',
    platform,
    maximized,
    fullScreen,
    // macOS and Windows already zoom on a double-clicked drag region (macOS even
    // honours the system "double-click title bar to" preference). Linux does not.
    onDoubleClick: platform === 'linux' ? onDoubleClick : undefined,
  };
}
