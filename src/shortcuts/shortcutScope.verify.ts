import assert from 'node:assert/strict';
import { shortcutAllowedForSurface } from './shortcutScope';

for (const surface of ['media-pool', 'inspector', 'other'] as const) {
  for (const action of ['select-all', 'copy', 'cut', 'paste', 'delete', 'split', 'play-pause', 'zoom-fit']) {
    assert.equal(
      shortcutAllowedForSurface(action, surface),
      false,
      `${surface} must not dispatch timeline-only action ${action}`,
    );
  }
}

for (const action of ['undo', 'redo', 'save-version', 'keyboard-shortcuts']) {
  assert.equal(shortcutAllowedForSurface(action, 'inspector'), true);
}

// The Library edit keys reach the dispatcher from wherever the click left the
// focus — usually the Library itself, which is not the timeline surface.
for (const surface of ['media-pool', 'inspector', 'other', 'timeline'] as const) {
  for (const action of ['library-append', 'library-insert', 'library-connect']) {
    assert.equal(
      shortcutAllowedForSurface(action, surface),
      true,
      `${action} must reach the dispatcher from ${surface}`,
    );
  }
}

assert.equal(shortcutAllowedForSurface('split', 'timeline'), true);
assert.equal(shortcutAllowedForSurface('copy', 'timeline'), true);

console.log('shortcutScope.verify: surface routing OK');
