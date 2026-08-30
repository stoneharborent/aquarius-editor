import assert from 'node:assert/strict';
import { allVisibleAssetsSelected, toggleVisibleAssetSelection } from './mediaSelectionActions';

const visible = ['map', 'route', 'video'];

assert.equal(allVisibleAssetsSelected(new Set(['map', 'route', 'video', 'outside']), visible), true,
  'when every currently visible asset is already selected, the blank right-click menu should switch to deselect-all');
assert.deepEqual(
  [...toggleVisibleAssetSelection(new Set(['map', 'route', 'video', 'outside']), visible)].sort(),
  ['outside'],
  'deselect-all must only remove currently visible assets, never accidentally clear a selection from another folder or outside the filter',
);
assert.deepEqual(
  [...toggleVisibleAssetSelection(new Set(['map', 'outside']), visible)].sort(),
  ['map', 'outside', 'route', 'video'],
  'when not fully selected, it should add the currently visible assets while keeping any other existing selection',
);

console.log('media selection actions verification passed');
