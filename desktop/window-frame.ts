// Window chrome policy: the app draws its own titlebar on every desktop platform.
//
// Royce's brief (2026-08-31): "Remove the file, edit, etc bar and have the top bar
// with name and the window controls to be the same color and theme so the app feels
// as one." The menu half of that lives in app-menu.ts; this module owns the frame.
//
// One rule per platform, and each one keeps the *system's* controls wherever the
// system draws better ones than we can:
//
//   linux   frame: false. The whole titlebar — surface, project title, and the
//           minimize/maximize/close buttons — is the renderer's TopBar, painted in
//           skin tokens. This is Royce's primary platform.
//   win32   titleBarStyle: 'hidden' + titleBarOverlay. Windows draws the caption
//           buttons itself, which is what keeps Snap Layouts working on the
//           maximize button, but it paints them in the colours we hand it, so the
//           bar still reads as one skinned surface. The renderer reserves the
//           overlay's width with env(titlebar-area-width).
//   darwin  titleBarStyle: 'hiddenInset' with the REAL traffic lights (this used to
//           hide them and draw three fake dots). The renderer reserves
//           MAC_TITLEBAR_INSET on the left and the OS paints over the skinned bar.
//
// Sizing is the fiddly part. window-scale.ts scales the whole renderer with
// `setZoomFactor`, so a CSS pixel is not a screen point: at zoom z, a titlebar the
// renderer paints H CSS px tall occupies H × z points on screen. Native chrome —
// traffic lights, the Windows overlay — is positioned in screen points and does not
// scale. So every native placement below is computed from the renderer's CSS height
// times the live zoom factor, and re-applied whenever either changes.
import type { BrowserWindowConstructorOptions, TitleBarOverlay } from 'electron';
import type { DesktopWindowChrome } from '../shared/window-chrome.ts';

/** The editor top bar's height in CSS pixels (useEditorPanelLayout's HEADER_HEIGHT). */
export const DEFAULT_TITLEBAR_HEIGHT = 41;
/** macOS traffic-light circle: 12pt across, and it never scales with the renderer. */
export const MAC_TRAFFIC_LIGHT_DIAMETER = 12;
/** Left gap before the first traffic light, in CSS pixels at zoom 1. */
export const MAC_TRAFFIC_LIGHT_INSET = 13;
/**
 * CSS pixels the renderer keeps clear on the left for the traffic lights:
 * inset 13 + three 12pt circles + two 8pt gaps = 65, plus the same 13 after them.
 */
export const MAC_TITLEBAR_INSET = 78;
/** Fallback width of the Windows caption buttons when the WCO env var is missing. */
export const WINDOWS_CAPTION_INSET = 138;

const positiveZoom = (zoomFactor: number): number =>
  (Number.isFinite(zoomFactor) && zoomFactor > 0 ? zoomFactor : 1);

/**
 * Where the traffic lights go, in screen points, so they sit centred in a titlebar
 * the renderer painted `titlebarHeight` CSS pixels tall at this zoom factor.
 */
export function macTrafficLightPosition(
  titlebarHeight: number = DEFAULT_TITLEBAR_HEIGHT,
  zoomFactor = 1,
): { x: number; y: number } {
  const zoom = positiveZoom(zoomFactor);
  const barHeight = titlebarHeight * zoom;
  return {
    x: Math.round(MAC_TRAFFIC_LIGHT_INSET * zoom),
    y: Math.max(0, Math.round((barHeight - MAC_TRAFFIC_LIGHT_DIAMETER) / 2)),
  };
}

/** The Windows Controls Overlay, coloured by the skin and sized to the painted bar. */
export function windowsTitleBarOverlay(
  chrome: DesktopWindowChrome,
  zoomFactor = 1,
): TitleBarOverlay {
  return {
    color: chrome.color,
    symbolColor: chrome.symbolColor,
    height: Math.max(1, Math.round(chrome.titlebarHeight * positiveZoom(zoomFactor))),
  };
}

type DesktopWindowFrameOptions = Pick<
  BrowserWindowConstructorOptions,
  'frame' | 'titleBarStyle' | 'titleBarOverlay' | 'trafficLightPosition'
>;

export function desktopWindowFrameOptions(
  platform: NodeJS.Platform = process.platform,
): DesktopWindowFrameOptions {
  if (platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: macTrafficLightPosition(),
    };
  }
  if (platform === 'win32') {
    // `true` means "system colours for now"; the renderer replaces them with the
    // live skin's the moment it mounts, and again on every skin switch. Naming a
    // colour here would mean hard-coding one, and the skins own every colour.
    return { titleBarStyle: 'hidden', titleBarOverlay: true };
  }
  return { frame: false };
}

interface WindowButtonVisibilityHost {
  setWindowButtonVisibility(visible: boolean): void;
}

export function applyDesktopWindowFrame(
  win: WindowButtonVisibilityHost,
  platform: NodeJS.Platform = process.platform,
): void {
  // The native traffic lights are the macOS controls now — they used to be hidden
  // so three CSS circles could stand in for them.
  if (platform === 'darwin') win.setWindowButtonVisibility(true);
}

export interface DesktopWindowChromeHost {
  setWindowButtonPosition?(position: { x: number; y: number }): void;
  setTitleBarOverlay?(overlay: TitleBarOverlay): void;
}

/** Push the renderer's painted geometry and colours onto the native chrome. */
export function applyDesktopWindowChrome(
  win: DesktopWindowChromeHost,
  chrome: DesktopWindowChrome,
  zoomFactor = 1,
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform === 'darwin') {
    win.setWindowButtonPosition?.(macTrafficLightPosition(chrome.titlebarHeight, zoomFactor));
    return;
  }
  if (platform === 'win32') {
    win.setTitleBarOverlay?.(windowsTitleBarOverlay(chrome, zoomFactor));
  }
  // Linux draws its own controls in the renderer; nothing native to place.
}
