// Runnable check: `npx tsx src/persist/projectFolders.verify.ts`.
//
// Dashboard folders. The contracts that matter:
//   · a folder is a label, never an owner — deleting one moves its projects
//     back to the root and deletes nothing;
//   · filing a project is not editing it, so updatedAt must not move;
//   · an index written before folders existed must load untouched.
import assert from 'node:assert/strict';
import type { ProjectDoc } from '../editor/types';
import { CURRENT_PROJECT_VERSION } from '../../shared/project-version';
import {
  createFolder,
  createProject,
  deleteFolder,
  deleteProject,
  duplicateProject,
  listFolders,
  listProjects,
  moveProjectToFolder,
  purgeProject,
  renameFolder,
  resetProjectStoreMemory,
} from './projectStore';
import { PROJECT_FOLDER_INDEX_KEY, normalizeFolderName } from './projectFolders';
import { kvGet, kvSet } from './sharedKv';

const emptyDoc: ProjectDoc = {
  version: CURRENT_PROJECT_VERSION,
  assets: [],
  mediaFolders: [],
  activeTimelineId: 'timeline',
  timelines: [{
    id: 'timeline',
    name: 'Sequence 1',
    order: 0,
    fps: 30,
    width: 1920,
    height: 1080,
    items: [],
    selectedId: null,
  }],
};

const folderIdOf = async (projectId: string): Promise<string | undefined> =>
  (await listProjects()).find((meta) => meta.id === projectId)?.folderId;

// ── Names ─────────────────────────────────────────────────────────────────
assert.equal(normalizeFolderName('  Client   Work  '), 'Client Work', 'folder names are trimmed and collapsed');
assert.equal(normalizeFolderName('   '), '', 'whitespace alone is not a name');
assert.equal(normalizeFolderName('x'.repeat(400)).length, 120, 'folder names are clamped');

// ── Folder CRUD ───────────────────────────────────────────────────────────
resetProjectStoreMemory();
assert.deepEqual(await listFolders(), [], 'a brand-new store has no folders');

const clients = await createFolder('Client Work');
const shorts = await createFolder('  Shorts ');
assert.equal(shorts.name, 'Shorts', 'a folder name is normalized on the way in');
assert.deepEqual(
  (await listFolders()).map((folder) => folder.name),
  ['Client Work', 'Shorts'],
  'folders list alphabetically',
);

const again = await createFolder('Client Work');
assert.equal(again.id, clients.id, 'creating an existing folder name reuses it rather than duplicating the shelf');
assert.equal((await listFolders()).length, 2, 'a duplicate name adds no second folder');

await assert.rejects(() => createFolder('   '), 'a folder must be named');

const renamed = await renameFolder(shorts.id, 'Short Form');
assert.equal(renamed?.name, 'Short Form', 'renaming returns the updated folder');
assert.equal((await listFolders()).find((folder) => folder.id === shorts.id)?.name, 'Short Form', 'the rename is persisted');
assert.equal(await renameFolder('missing-folder', 'Nope'), null, 'renaming a folder that is gone reports null');
assert.equal(await renameFolder(shorts.id, '  '), null, 'a blank rename is refused');

// ── Moving projects ───────────────────────────────────────────────────────
const filed = await createProject('Filed Project', emptyDoc);
const loose = await createProject('Loose Project', emptyDoc);
assert.equal(filed.folderId, undefined, 'a new project starts at the root');

const moved = await moveProjectToFolder(filed.id, clients.id);
assert.equal(moved?.folderId, clients.id, 'moving reports the filed project');
assert.equal(await folderIdOf(filed.id), clients.id, 'the move is persisted on the project index');
assert.equal(moved?.updatedAt, filed.updatedAt, 'filing a project is not editing it: updatedAt must not move');
assert.equal(await folderIdOf(loose.id), undefined, 'other projects are untouched');

assert.equal(await moveProjectToFolder(filed.id, 'no-such-folder'), null, 'a project cannot be moved into a folder that does not exist');
assert.equal(await folderIdOf(filed.id), clients.id, 'a refused move changes nothing');
assert.equal(await moveProjectToFolder('no-such-project', clients.id), null, 'moving an unknown project reports null');

const copy = await duplicateProject(filed.id);
assert.equal(copy?.folderId, clients.id, 'a duplicate lands on the same shelf as its source');

const born = await createProject('Born Filed', emptyDoc, { folderId: shorts.id });
assert.equal(born.folderId, shorts.id, 'a project can be created straight into a folder');

const backToRoot = await moveProjectToFolder(filed.id, null);
assert.equal(backToRoot?.folderId, undefined, 'moving to the root clears the folder rather than storing an empty one');
assert.ok(!Object.hasOwn(backToRoot!, 'folderId'), 'the root is the absence of folderId, never a null value');
await moveProjectToFolder(filed.id, clients.id);

// ── Deleting a folder never deletes projects ──────────────────────────────
const beforeDelete = await listProjects();
await deleteFolder(clients.id);
const afterDelete = await listProjects();
assert.equal(afterDelete.length, beforeDelete.length, 'deleting a folder deletes no projects');
assert.equal(await folderIdOf(filed.id), undefined, 'a deleted folder sends its projects back to the root');
assert.equal(await folderIdOf(copy!.id), undefined, 'every project in the folder is moved back, not just the first');
assert.equal(await folderIdOf(born.id), shorts.id, 'projects in other folders stay where they are');
assert.deepEqual(
  (await listFolders()).map((folder) => folder.id),
  [shorts.id],
  'the folder itself is gone',
);
await deleteFolder('no-such-folder');
assert.deepEqual((await listFolders()).map((folder) => folder.id), [shorts.id], 'deleting a folder that is gone is a no-op');

// Soft-deleted and purged projects must not leave a folder holding a ghost.
await deleteProject(born.id);
assert.equal((await listProjects()).some((meta) => meta.id === born.id), false, 'a soft-deleted project leaves the dashboard');
await purgeProject(born.id);
assert.equal(
  (await listProjects({ includeDeleted: true })).some((meta) => meta.id === born.id),
  false,
  'purging removes the filed project entirely',
);

// ── Migration: an index written before folders existed ────────────────────
resetProjectStoreMemory();
const legacyIndex = [
  { id: 'legacy-a', name: 'Old Cut', updatedAt: 1_700_000_000_000 },
  { id: 'legacy-b', name: 'Older Cut', updatedAt: 1_600_000_000_000, description: 'kept' },
];
await kvSet('projects', legacyIndex);
assert.equal(await kvGet(PROJECT_FOLDER_INDEX_KEY), undefined, 'an old store has no folder record at all');
assert.deepEqual(await listFolders(), [], 'a store with no folder record simply has no folders');
const legacy = await listProjects();
assert.deepEqual(legacy.map((meta) => meta.id), ['legacy-a', 'legacy-b'], 'the old index still loads, newest first');
assert.equal(legacy.every((meta) => meta.folderId === undefined), true, 'no project is invented into a folder');
assert.equal(legacy[1]!.description, 'kept', 'existing metadata survives untouched');

// Folders can then be introduced on top of that index without rewriting it.
const introduced = await createFolder('Archive');
assert.equal(await moveProjectToFolder('legacy-a', introduced.id) !== null, true, 'an old project can be filed once folders exist');
assert.equal(await folderIdOf('legacy-a'), introduced.id, 'the old index gains folderId in place');
assert.equal(await folderIdOf('legacy-b'), undefined, 'projects nobody filed stay at the root');

console.log('projectFolders.verify: folder CRUD, moves, delete-moves-to-root and old-index migration OK');
