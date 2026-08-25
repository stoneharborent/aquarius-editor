import assert from 'node:assert/strict';
import type { MediaAsset } from '../editor/types';
import { importMediaBatch } from './mediaPoolImport';

const targetFolderId = 'folder-travel';
const placeholder = { id: 'asset-1', name: 'trip.mov' } as MediaAsset;
const ready = { ...placeholder, src: '/media/trip.mov' } as MediaAsset;
const placements: Array<{ ids: string[]; folderId?: string }> = [];

const errors = await importMediaBatch({
  files: [{ name: 'trip.mov' } as File],
  targetFolderId,
  onImport: async (_file, _onProgress, lifecycle) => {
    lifecycle?.onPlaceholder?.(placeholder);
    assert.deepEqual(placements.at(-1), { ids: ['asset-1'], folderId: targetFolderId },
      'the placeholder must be placed into the drop target folder immediately');
    lifecycle?.onAssetUpdated?.(ready);
    assert.deepEqual(placements.at(-1), { ids: ['asset-1'], folderId: targetFolderId },
      'the ready asset must reconfirm the drop target folder');
    return ready;
  },
  onMoveAssets: (ids, folderId) => placements.push({ ids, folderId }),
  onProgress: () => undefined,
});

assert.deepEqual(errors, [], 'a successful import should not produce batch errors');
assert.deepEqual(placements, [
  { ids: ['asset-1'], folderId: targetFolderId },
  { ids: ['asset-1'], folderId: targetFolderId },
], 'both the placeholder and ready stages must be placed into the same drop target folder');

const nestedPlacements: Array<{ ids: string[]; folderId?: string }> = [];
await importMediaBatch({
  files: [{ name: 'day-1.mov' } as File, { name: 'day-2.mov' } as File],
  targetFolderIds: ['folder-day-1', 'folder-day-2'],
  onImport: async (file) => ({ id: file.name, name: file.name }) as MediaAsset,
  onMoveAssets: (ids, folderId) => nestedPlacements.push({ ids, folderId }),
  onProgress: () => undefined,
});
assert.deepEqual(nestedPlacements, [
  { ids: ['day-1.mov'], folderId: 'folder-day-1' },
  { ids: ['day-2.mov'], folderId: 'folder-day-2' },
], 'each asset must preserve the folder hierarchy from the import directory');

console.log('media-folder-drop.verify: placeholder and ready preserve the target folder');
