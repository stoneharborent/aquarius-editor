import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { MenuItemConstructorOptions } from 'electron';
import { applicationMenuTemplate, installApplicationMenu } from './app-menu.ts';

// Royce's brief: the File/Edit/… bar goes away. On Linux and Windows that has to
// be a *removed* menu, not an auto-hidden one, or Alt summons it straight back.
for (const platform of ['linux', 'win32'] as const) {
  assert.equal(
    applicationMenuTemplate(platform),
    null,
    `${platform} must have no application menu at all`,
  );
}

// macOS keeps one: its menu lives in the system bar, not the window, and the OS
// routes ⌘C/⌘V/⌘Z through it.
const mac = applicationMenuTemplate('darwin');
assert.ok(Array.isArray(mac), 'macOS keeps an application menu');
assert.deepEqual(
  mac.map((item) => item.role ?? item.label),
  ['appMenu', 'editMenu', 'Window'],
  'macOS menu is slimmed to the standard minimum: app menu, Edit roles, Window',
);
assert.equal(
  mac.some((item) => item.role === 'viewMenu'),
  false,
  'the View menu is gone: it owned ⌘R and the ⌘+/-/0 zoom items, which shadowed the app’s own',
);

const windowMenu = mac.at(-1) as MenuItemConstructorOptions;
const windowRoles = (windowMenu.submenu as MenuItemConstructorOptions[])
  .map((item) => item.role ?? item.type);
assert.deepEqual(
  windowRoles,
  ['minimize', 'zoom', 'togglefullscreen', 'separator', 'front', 'close'],
  'Enter Full Screen moves into Window so ⌃⌘F survives the View menu removal',
);

// installApplicationMenu clears rather than skips.
{
  const installed: unknown[] = [];
  installApplicationMenu({
    buildFromTemplate: (template) => ({ template }),
    setApplicationMenu: (menu) => installed.push(menu),
  }, 'linux');
  assert.deepEqual(installed, [null], 'Linux installs a null menu, not the Electron default');

  const built: unknown[] = [];
  installApplicationMenu({
    buildFromTemplate: (template) => { built.push(template); return { template }; },
    setApplicationMenu: () => {},
  }, 'darwin');
  assert.equal(built.length, 1, 'macOS builds its slim menu once');
}

// Nothing may quietly re-introduce a menu for the menu-less platforms.
const mainSource = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
assert.match(mainSource, /installApplicationMenu\(/, 'boot installs the platform menu policy');
assert.doesNotMatch(
  mainSource,
  /autoHideMenuBar|setMenuBarVisibility/,
  'a hidden menu bar is not a removed one — Alt would bring it back',
);

console.log('desktop app-menu verification passed');
