import assert from 'node:assert/strict';
import chineseMedia from '../i18n/dict/zh/ui/media';
import { mediaViewToggleLabel, toggleMediaView } from './mediaView';

assert.equal(mediaViewToggleLabel('list'), 'Switch to grid view');
assert.equal(toggleMediaView('list'), 'grid');
assert.equal(mediaViewToggleLabel('grid'), 'Switch to list view');
assert.equal(toggleMediaView('grid'), 'list');
for (const view of ['grid', 'list'] as const) {
  const label = mediaViewToggleLabel(view);
  assert.ok(chineseMedia[label], `Chinese media dictionary must contain the view-toggle label: ${label}`);
}

console.log('media view toggle verification passed');
