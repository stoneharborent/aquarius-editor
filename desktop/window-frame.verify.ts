import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  isDesktopWindowChrome,
  isDesktopWindowState,
  WINDOW_CHROME_CHANNELS,
} from '../shared/window-chrome.ts';

const moduleUrl = new URL('./window-frame.ts', import.meta.url);
assert.equal(existsSync(moduleUrl), true, 'desktop window frame policy must be independently testable');

const {
  applyDesktopWindowChrome,
  applyDesktopWindowFrame,
  desktopWindowFrameOptions,
  macTrafficLightPosition,
  windowsTitleBarOverlay,
  MAC_TITLEBAR_INSET,
} = await import(moduleUrl.href);

// ── the frame each platform gets ────────────────────────────────────────────
{
  const mac = desktopWindowFrameOptions('darwin');
  assert.equal(mac.titleBarStyle, 'hiddenInset', 'macOS keeps its inset titlebar');
  assert.deepEqual(
    mac.trafficLightPosition,
    macTrafficLightPosition(),
    'the real traffic lights are positioned for the app-drawn bar',
  );

  const win = desktopWindowFrameOptions('win32');
  assert.equal(win.titleBarStyle, 'hidden', 'Windows loses its native title bar');
  assert.equal(
    win.titleBarOverlay,
    true,
    'Windows keeps the system caption buttons (Snap Layouts) — the renderer recolours them',
  );
  assert.equal(win.frame, undefined, 'titleBarStyle hidden already removes the frame on Windows');

  assert.deepEqual(
    desktopWindowFrameOptions('linux'),
    { frame: false },
    'Linux is fully frameless: the app draws the whole bar, controls included',
  );
}

// ── macOS traffic lights are visible again (they used to be faked in CSS) ───
{
  const visibility: boolean[] = [];
  applyDesktopWindowFrame({
    setWindowButtonVisibility: (visible: boolean) => visibility.push(visible),
  }, 'darwin');
  assert.deepEqual(visibility, [true], 'the native traffic lights are the macOS controls');

  applyDesktopWindowFrame({
    setWindowButtonVisibility: (visible: boolean) => visibility.push(visible),
  }, 'win32');
  assert.deepEqual(visibility, [true], 'non-macOS platforms do not call macOS window APIs');
}

// ── native chrome is placed in SCREEN points, so it tracks the renderer zoom ──
{
  const at1 = macTrafficLightPosition(41, 1);
  assert.deepEqual(at1, { x: 13, y: 15 }, '12pt circle centred in a 41px bar');
  const at15 = macTrafficLightPosition(41, 1.5);
  assert.ok(at15.y > at1.y, 'a zoomed-in renderer paints a taller bar, so the lights move down');
  assert.equal(at15.x, 20, 'the left inset scales with the renderer like the reserved CSS lane');
  assert.deepEqual(
    macTrafficLightPosition(48, 1),
    { x: 13, y: 18 },
    'the dashboard header is taller than the editor top bar and gets its own centring',
  );
  assert.equal(macTrafficLightPosition(41, 0).y, at1.y, 'a nonsense zoom falls back to 1');
  assert.ok(MAC_TITLEBAR_INSET > 65, 'the reserved lane clears all three 12pt circles');
}

{
  const overlay = windowsTitleBarOverlay(
    { titlebarHeight: 41, color: '#f0f6fc', symbolColor: '#16273a' },
    2,
  );
  assert.deepEqual(
    overlay,
    { color: '#f0f6fc', symbolColor: '#16273a', height: 82 },
    'the Windows overlay takes the skin colours and the scaled bar height',
  );
}

// ── applyDesktopWindowChrome routes to the right native call per platform ───
{
  const chrome = { titlebarHeight: 41, color: '#f0f6fc', symbolColor: '#16273a' };
  const calls: string[] = [];
  const host = {
    setWindowButtonPosition: () => calls.push('mac'),
    setTitleBarOverlay: () => calls.push('win'),
  };
  applyDesktopWindowChrome(host, chrome, 1, 'darwin');
  assert.deepEqual(calls, ['mac']);
  applyDesktopWindowChrome(host, chrome, 1, 'win32');
  assert.deepEqual(calls, ['mac', 'win']);
  applyDesktopWindowChrome(host, chrome, 1, 'linux');
  assert.deepEqual(calls, ['mac', 'win'], 'Linux has no native chrome to place');
  // A host missing the optional macOS/Windows APIs must not throw.
  applyDesktopWindowChrome({}, chrome, 1, 'darwin');
  applyDesktopWindowChrome({}, chrome, 1, 'win32');
}

// ── the renderer-supplied chrome is untrusted input ─────────────────────────
{
  assert.equal(isDesktopWindowChrome({ titlebarHeight: 41, color: '#F0F6FC', symbolColor: '#16273a' }), true);
  assert.equal(isDesktopWindowChrome({ titlebarHeight: 0, color: '#f0f6fc', symbolColor: '#16273a' }), false);
  assert.equal(isDesktopWindowChrome({ titlebarHeight: 41, color: 'red', symbolColor: '#16273a' }), false);
  assert.equal(isDesktopWindowChrome({ titlebarHeight: 41, color: '#f0f6fc' }), false);
  assert.equal(isDesktopWindowChrome({ titlebarHeight: 9001, color: '#f0f6fc', symbolColor: '#16273a' }), false);
  assert.equal(isDesktopWindowChrome(null), false);
  assert.equal(isDesktopWindowState({ maximized: true, fullScreen: false }), true);
  assert.equal(isDesktopWindowState({ maximized: 'yes', fullScreen: false }), false);
}

// ── the main process actually wires all of it ──────────────────────────────
const mainSource = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
assert.match(mainSource, /openchatcut:window-action/, 'main process must register window actions');
assert.match(mainSource, /WINDOW_CHROME_CHANNELS\.setChrome/, 'renderer can report its painted bar');
assert.match(mainSource, /WINDOW_CHROME_CHANNELS\.readState/, 'renderer can read maximize state');
assert.match(mainSource, /installWindowStateBroadcast\(win\)/, 'state changes reach the renderer');
assert.match(mainSource, /installWindowKeyActions\(win, !app\.isPackaged\)/, 'devtools stay behind the dev flag');
assert.match(
  mainSource,
  /applyResponsiveWindowScale\(win\);\s*\n\s*syncNativeWindowChrome\(win\);/,
  'a UI-scale change re-places the native chrome, which is measured in screen points',
);
assert.equal(
  WINDOW_CHROME_CHANNELS.setChrome.startsWith('openchatcut:'),
  true,
  'IPC channels keep the upstream namespace (see CLAUDE.md)',
);

console.log('desktop window-frame verification passed');
