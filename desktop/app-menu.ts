// The application menu.
//
// Aquarius Editor draws its own titlebar (see window-frame.ts), so on Linux and
// Windows there is no File/Edit/View menu bar at all — not an auto-hidden one that
// Alt would summon back, but no menu object installed. Electron builds a *default*
// menu when nobody sets one, so removing it means explicitly installing `null`.
//
// Removing it is safe, and on those two platforms it also fixes three key
// collisions, because Electron menu accelerators are handled before the page sees
// the key at all:
//   Ctrl+R  — the default View>Reload swallowed the editor's "Move right to boundary".
//   Ctrl+M  — the default Window>Minimize swallowed "Delete marker at playhead".
//   Ctrl+= / Ctrl+- / Ctrl+0 — the default View zoom items swallowed the timeline
//             zoom actions and the desktop UI-scale accelerators.
// Chromium itself handles cut/copy/paste/select-all/undo inside editable fields on
// Windows and Linux, so text editing is unaffected; the right-click menu in
// context-menu.ts still offers those commands explicitly on every platform.
//
// macOS is different: its menu lives in the system bar, not in the window, and the
// OS routes ⌘C/⌘V/⌘Z through it — with no menu those shortcuts stop working in text
// fields. So macOS keeps a menu, slimmed to the standard minimum: the application
// menu, the Edit roles, and Window. The View menu is gone there too (same collision
// story: it owned ⌘R and ⌘+/-/0); Enter Full Screen moves into Window so it keeps
// its ⌃⌘F accelerator, and DevTools moves onto the dev-only accelerator in
// window-keys.ts.
import type { MenuItemConstructorOptions } from 'electron';

export interface ApplicationMenuHost {
  buildFromTemplate(template: MenuItemConstructorOptions[]): unknown;
  setApplicationMenu(menu: unknown): void;
}

/**
 * The menu template for a platform, or `null` when the platform must have no
 * application menu at all.
 */
export function applicationMenuTemplate(
  platform: NodeJS.Platform,
): MenuItemConstructorOptions[] | null {
  if (platform !== 'darwin') return null;
  return [
    { role: 'appMenu' },
    { role: 'editMenu' },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'front' },
        { role: 'close' },
      ],
    },
  ];
}

/** Install the platform's menu (or clear it) exactly once, at boot. */
export function installApplicationMenu(
  host: ApplicationMenuHost,
  platform: NodeJS.Platform = process.platform,
): void {
  const template = applicationMenuTemplate(platform);
  host.setApplicationMenu(template === null ? null : host.buildFromTemplate(template));
}
