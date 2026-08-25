import assert from 'node:assert/strict';
import { addAssetsToChat, allVisibleAssetsSelected, toggleVisibleAssetSelection } from './mediaSelectionActions';

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

const selectedAssets = [{ id: 'map' }, { id: 'route' }, { id: 'video' }];
const chatCalls: Array<Array<{ id: string }>> = [];
addAssetsToChat(selectedAssets, (assets) => chatCalls.push(assets));
assert.equal(chatCalls.length, 1, 'bulk-adding to AI chat must call the callback exactly once');
assert.deepEqual(chatCalls[0]?.map((asset) => asset.id), ['map', 'route', 'video'],
  'a single chat seed must preserve the selection order of every asset reference');

console.log('media selection actions verification passed');
