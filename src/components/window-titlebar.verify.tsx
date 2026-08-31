import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesktopWindowControlButtons, DesktopWindowControls } from './DesktopWindowControls';
import { desktopChromePlatform, normalizeHexColor } from '../hooks/useDesktopWindowChrome';

const t = (text: string) => text;

// ── Linux draws its own controls, in GNOME order, with a live restore state ──
{
  const actions: string[] = [];
  const html = renderToStaticMarkup(
    <DesktopWindowControlButtons translate={t} maximized={false} onAction={(a) => actions.push(a)} />,
  );
  assert.match(html, /aria-label="Window controls"/);
  assert.equal((html.match(/<button/g) ?? []).length, 3, 'minimize, maximize, close');
  assert.match(html, /aria-label="Minimize window"/);
  assert.match(html, /aria-label="Maximize window"/);
  assert.match(html, /aria-label="Close window"/);
  assert.ok(
    html.indexOf('Minimize window') < html.indexOf('Maximize window')
      && html.indexOf('Maximize window') < html.indexOf('Close window'),
    'controls run minimize → maximize → close, the Linux/Windows order',
  );
  assert.deepEqual(actions, [], 'rendering controls does not invoke native actions');

  const restored = renderToStaticMarkup(
    <DesktopWindowControlButtons translate={t} maximized onAction={() => {}} />,
  );
  assert.match(restored, /aria-label="Restore window"/, 'a maximized window offers restore');
  assert.match(restored, /aria-pressed="true"/, 'the maximize control reports its state');
}

// ── each platform gets the right slot content ───────────────────────────────
{
  const slot = (
    placement: 'leading' | 'trailing',
    platform: 'mac' | 'windows' | 'linux' | null,
    fullScreen = false,
  ): string => renderToStaticMarkup(
    <DesktopWindowControls
      placement={placement}
      platform={platform}
      maximized={false}
      fullScreen={fullScreen}
    />,
  );

  assert.match(slot('leading', 'mac'), /cc-window-inset--mac/, 'macOS keeps the traffic-light lane clear');
  assert.equal(slot('leading', 'mac', true), '', 'full screen takes the traffic lights away, and the lane with them');
  assert.equal(slot('trailing', 'mac'), '', 'macOS controls live on the left, drawn by the OS');
  assert.match(slot('trailing', 'windows'), /cc-window-inset--win/, 'Windows reserves the Controls Overlay width');
  assert.equal(slot('leading', 'windows'), '', 'Windows controls are on the right');
  assert.match(slot('trailing', 'linux'), /aria-label="Window controls"/, 'Linux draws its own cluster');
  assert.equal(slot('leading', 'linux'), '');
  assert.equal(slot('leading', null), '', 'the browser build has no window chrome');
  assert.equal(slot('trailing', null), '', 'the browser build has no window chrome');
}

// ── platform mapping + the colour reader that feeds the native chrome ───────
{
  assert.equal(desktopChromePlatform('darwin'), 'mac');
  assert.equal(desktopChromePlatform('win32'), 'windows');
  assert.equal(desktopChromePlatform('linux'), 'linux');
  assert.equal(desktopChromePlatform(undefined), null, 'no bridge means no window chrome');
  assert.equal(desktopChromePlatform('freebsd'), null);

  assert.equal(normalizeHexColor('  #F0F6FC '), '#f0f6fc');
  assert.equal(normalizeHexColor('#abc'), '#aabbcc');
  assert.equal(normalizeHexColor('rgb(1,2,3)'), null, 'the main process only accepts hex');
}

// ── both titlebars are wired to the shared binding ─────────────────────────
{
  const topBar = readFileSync(new URL('./TopBar.tsx', import.meta.url), 'utf8');
  const dashboard = readFileSync(new URL('./Dashboard.tsx', import.meta.url), 'utf8');
  for (const [name, source] of [['TopBar', topBar], ['Dashboard', dashboard]] as const) {
    assert.match(source, /useDesktopWindowChrome\(/, `${name} reports its bar to the main process`);
    assert.match(source, /className=\{(`cc-topbar \$\{)?chrome\.className/, `${name} takes its titlebar classes from the binding`);
    assert.match(source, /onDoubleClick=\{chrome\.onDoubleClick\}/, `${name} supports double-click to maximize`);
    assert.match(source, /placement="leading"/, `${name} reserves the leading slot`);
    assert.match(source, /placement="trailing"/, `${name} reserves the trailing slot`);
  }
  assert.match(
    topBar,
    /data-cc-titlebar-control="true"[\s\S]{0,80}onDoubleClick/,
    'double-clicking the project title renames it instead of maximizing the window',
  );
}

// ── CSS: drag region, opt-outs, and skin tokens only ───────────────────────
{
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  assert.match(css, /\.cc-window-titlebar--desktop\s*\{[^}]*app-region:drag/, 'the titlebar drags the window');
  assert.match(css, /\.cc-window-titlebar--desktop \[data-cc-titlebar-control="true"\][^{]*\{[^}]*app-region:no-drag/, 'opted-out elements stay clickable');
  assert.match(css, /\.cc-window-controls\s*\{[^}]*app-region:no-drag/, 'the control cluster is not a drag handle');
  assert.match(css, /\.cc-window-inset--win\s*\{[^}]*env\(titlebar-area-width/, 'the Windows lane follows the real overlay width');

  const controlBlocks = [...css.matchAll(/\.cc-window-control[^{]*\{([^}]*)\}/g)].map(([, body]) => body);
  assert.ok(controlBlocks.length >= 3, 'the Linux controls are styled');
  for (const body of controlBlocks) {
    const colored = /(color|background|outline)\s*:/.test(body);
    if (!colored) continue;
    assert.match(body, /var\(--cc-/, `window control colours must come from skin tokens: ${body.trim()}`);
  }
}

console.log('renderer window-titlebar verification passed');
