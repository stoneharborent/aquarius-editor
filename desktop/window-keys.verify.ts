import assert from 'node:assert/strict';
import { resolveWindowKeyAction, type DesktopKeyInput } from './window-keys.ts';

const key = (over: Partial<DesktopKeyInput>): DesktopKeyInput => ({
  type: 'keyDown', code: '', control: false, meta: false, shift: false, alt: false, ...over,
});

const linux = { platform: 'linux' as NodeJS.Platform, devTools: false };
const win = { platform: 'win32' as NodeJS.Platform, devTools: false };
const mac = { platform: 'darwin' as NodeJS.Platform, devTools: false };

// F11 replaces the removed View > Toggle Full Screen on the menu-less platforms.
assert.equal(resolveWindowKeyAction(key({ code: 'F11' }), linux), 'toggle-fullscreen');
assert.equal(resolveWindowKeyAction(key({ code: 'F11' }), win), 'toggle-fullscreen');
assert.equal(
  resolveWindowKeyAction(key({ code: 'F11' }), mac),
  null,
  'macOS keeps Enter Full Screen in its Window menu (⌃⌘F)',
);
assert.equal(
  resolveWindowKeyAction(key({ code: 'F11', shift: true }), linux),
  null,
  'modified F11 is not the fullscreen key',
);

// Ctrl+Q is the GNOME quit the removed File menu used to carry.
assert.equal(resolveWindowKeyAction(key({ code: 'KeyQ', control: true }), linux), 'quit');
assert.equal(
  resolveWindowKeyAction(key({ code: 'KeyQ', control: true }), win),
  null,
  'Windows quits with Alt+F4 and never had Ctrl+Q',
);
assert.equal(
  resolveWindowKeyAction(key({ code: 'KeyQ', meta: true }), mac),
  null,
  '⌘Q is the macOS app menu’s job, not ours',
);

// DevTools only exists in a development run.
assert.equal(resolveWindowKeyAction(key({ code: 'F12' }), linux), null);
assert.equal(
  resolveWindowKeyAction(key({ code: 'F12' }), { ...linux, devTools: true }),
  'toggle-devtools',
);
assert.equal(
  resolveWindowKeyAction(key({ code: 'KeyI', control: true, shift: true }), { ...linux, devTools: true }),
  'toggle-devtools',
);
assert.equal(
  resolveWindowKeyAction(key({ code: 'KeyI', meta: true, alt: true }), { ...mac, devTools: true }),
  'toggle-devtools',
);
assert.equal(
  resolveWindowKeyAction(key({ code: 'KeyI', control: true, shift: true }), { ...mac, devTools: true }),
  null,
  'the PC devtools chord is not the macOS one',
);

// Editor shortcuts the old default menu used to swallow must reach the page now:
// Ctrl+R ("Move right to boundary"), Ctrl+M ("Delete marker at playhead"),
// Ctrl+= / Ctrl+- / Ctrl+0 (timeline zoom and the desktop UI scale).
for (const code of ['KeyR', 'KeyM', 'Equal', 'Minus', 'Digit0']) {
  assert.equal(
    resolveWindowKeyAction(key({ code, control: true }), { ...linux, devTools: true }),
    null,
    `Ctrl+${code} belongs to the app's own shortcut system`,
  );
}

// Key-ups never trigger anything.
assert.equal(resolveWindowKeyAction(key({ type: 'keyUp', code: 'F11' }), linux), null);

console.log('desktop window-keys verification passed');
