// Stable regression for the shortcut catalog (count, chord parsing, matcher routing).
// Wired into verify:shortcuts (npm pretest).
import assert from 'node:assert';
import { SHORTCUT_CATALOG, SHORTCUT_BY_ID } from './catalog';
import { matchShortcut, parseBindingAlts, parseChord } from './match';

assert.strictEqual(SHORTCUT_CATALOG.length, 55);
assert.ok(SHORTCUT_BY_ID['play-pause']);
assert.ok(SHORTCUT_BY_ID['shuttle-back']);

const space = parseChord('Space');
assert.ok(space);
assert.strictEqual(space!.key, 'space');

const chord = parseChord('Mod + Alt + V');
assert.ok(chord);
assert.strictEqual(chord!.mod, true);
assert.strictEqual(chord!.alt, true);
assert.strictEqual(chord!.key, 'v');

const alts = parseBindingAlts(', / Shift + ,');
assert.strictEqual(alts.length, 2);
assert.strictEqual(alts[0]!.key, ',');
assert.strictEqual(alts[1]!.shift, true);

// Node has no document — mock target
const fakeTarget = { tagName: 'DIV', isContentEditable: false, closest: () => null } as unknown as HTMLElement;

function keyN(init: Partial<KeyboardEvent> & { key: string; code?: string }): KeyboardEvent {
  return {
    key: init.key,
    code: init.code,
    shiftKey: !!init.shiftKey,
    altKey: !!init.altKey,
    metaKey: !!init.metaKey,
    ctrlKey: !!init.ctrlKey,
    repeat: false,
    target: fakeTarget,
    preventDefault() {},
  } as unknown as KeyboardEvent;
}

const catalog = SHORTCUT_CATALOG.map((a) => ({ id: a.id, keys: a.keys, disabledWhenTyping: a.disabledWhenTyping }));

const match = (init: Partial<KeyboardEvent> & { key: string; code?: string }): string | null =>
  matchShortcut(keyN(init), catalog, { held: new Set(), isMac: true });

// ── Final Cut Pro layout (docs/fcp-shortcut-map.md is the law) ──
assert.strictEqual(match({ key: 'a' }), 'interaction-mode-selection', 'A = Select tool');
assert.strictEqual(match({ key: 't' }), 'interaction-mode-trim', 'T = Trim tool');
assert.strictEqual(match({ key: 'b' }), 'interaction-mode-blade', 'B = Blade tool');
assert.strictEqual(match({ key: 'b', metaKey: true }), 'split', '⌘B = blade at playhead');
assert.strictEqual(match({ key: 'n' }), 'snapping', 'N = snapping');
assert.strictEqual(match({ key: 'x' }), 'zone-clip', 'X = mark clip');
assert.strictEqual(match({ key: 'x', altKey: true, code: 'KeyX' }), 'zone-clear', '⌥X = clear marks');
assert.strictEqual(match({ key: 'm' }), 'marker-add', 'M = add marker');
assert.strictEqual(match({ key: 'm', altKey: true, code: 'KeyM' }), 'marker-shortcut-add-and-open', '⌥M = add + modify marker');
assert.strictEqual(match({ key: 'm', ctrlKey: true }), 'marker-delete-at-playhead', '⌃M = delete marker');
assert.strictEqual(match({ key: ';', ctrlKey: true }), 'marker-prev', '⌃; = previous marker');
assert.strictEqual(match({ key: "'", ctrlKey: true }), 'marker-next', "⌃' = next marker");
assert.strictEqual(match({ key: ',' }), 'nudge-left', ', = nudge one frame left');
assert.strictEqual(match({ key: '.' }), 'nudge-right', '. = nudge one frame right');
// macOS reports the shifted character, not the cap — "<" has to fold back to ",".
assert.strictEqual(match({ key: '<', shiftKey: true, code: 'Comma' }), 'nudge-left', '⇧, = nudge ten frames left');
assert.strictEqual(match({ key: '>', shiftKey: true, code: 'Period' }), 'nudge-right', '⇧. = nudge ten frames right');
// …and ⌥[ / ⌥] arrive as typographic quotes on macOS, so the physical key decides.
assert.strictEqual(match({ key: '“', altKey: true, code: 'BracketLeft' }), 'trim-start', '⌥[ = trim start');
assert.strictEqual(match({ key: '‘', altKey: true, code: 'BracketRight' }), 'trim-end', '⌥] = trim end');
assert.strictEqual(match({ key: 'z', shiftKey: true }), 'zoom-fit', '⇧Z = zoom to fit');
assert.strictEqual(match({ key: 'f', metaKey: true, shiftKey: true }), 'fullscreen', '⇧⌘F = full-screen preview');
// Keys the remap freed must no longer fire anything.
for (const key of ['v', 'q', 'w', 'e', 'r', 's', 'c', '/']) {
  assert.strictEqual(match({ key }), null, `${key.toUpperCase()} is free after the FCP remap`);
}

assert.strictEqual(
  matchShortcut(keyN({ key: ' ' }), catalog, { held: new Set(), isMac: true }),
  'play-pause',
);
assert.strictEqual(
  matchShortcut(keyN({ key: 'ArrowLeft' }), catalog, { held: new Set(), isMac: true }),
  'seek-back',
);
assert.strictEqual(
  matchShortcut(keyN({ key: 'ArrowLeft', shiftKey: true }), catalog, { held: new Set(), isMac: true }),
  'seek-back-sec',
);
assert.strictEqual(
  matchShortcut(keyN({ key: 'j' }), catalog, { held: new Set(), isMac: true }),
  'shuttle-back',
);
assert.strictEqual(
  matchShortcut(keyN({ key: 'i' }), catalog, { held: new Set(), isMac: true }),
  'zone-in',
);
assert.strictEqual(
  matchShortcut(keyN({ key: 'k', metaKey: true, altKey: true }), catalog, { held: new Set(), isMac: true }),
  'keyboard-shortcuts',
);
assert.strictEqual(
  matchShortcut(keyN({ key: 'v', metaKey: true, altKey: true }), catalog, { held: new Set(), isMac: true }),
  'paste-effects',
);
// combo K+J
assert.strictEqual(
  matchShortcut(keyN({ key: 'j' }), catalog, { held: new Set(['k']), isMac: true }),
  'shuttle-jog-back',
);

// ── the default preset must stay conflict-free: no chord may reach two actions ──
const owner = new Map<string, string>();
for (const action of SHORTCUT_CATALOG) {
  for (const chord of parseBindingAlts(action.keys)) {
    const sig = `${chord.mod ? 'M' : ''}${chord.ctrl ? 'C' : ''}${chord.alt ? 'A' : ''}${chord.shift ? 'S' : ''}:${chord.key}${chord.withKey ? '+' + chord.withKey : ''}`;
    const previous = owner.get(sig);
    assert.strictEqual(previous, undefined, `${action.keys} collides: ${action.id} vs ${previous}`);
    owner.set(sig, action.id);
  }
}

console.log('shortcuts catalog.verify: ok');
