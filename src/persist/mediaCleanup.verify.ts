// Media-cleanup pure-logic check: reference-set difference, and the exclusivity semantics for cascade delete (goes through the real flow via the in-memory projectStore).
// How to run: npx tsx src/persist/mediaCleanup.check.ts (already wired into verify:persist, runs with pretest).
import assert from 'node:assert/strict';
import { collectAllUploadRefs, unreferencedOf } from './mediaCleanup';
import { createProject, listProjectDocIds, purgeProject } from './projectStore';
import type { ProjectDoc } from '../editor/types';

// ── unreferencedOf: files on disk minus references ──────────────────────
{
  const files = [
    { name: 'a.mp4', bytes: 10, mtimeMs: 1 },
    { name: '李白_01_开篇.mp3', bytes: 20, mtimeMs: 2 },
    { name: 'kept.png', bytes: 30, mtimeMs: 3 },
  ];
  const refs = new Set(['/media/uploads/kept.png']);
  const orphans = unreferencedOf(files, refs);
  assert.deepEqual(orphans.map((f) => f.name), ['a.mp4', '李白_01_开篇.mp3'], 'referenced files never enter the orphan list (Chinese names work as usual)');
  console.log('unreferencedOf: OK');
}

// ── Union of references + exclusivity judgment (in-memory projectStore) ──
{
  const doc = (src: string): ProjectDoc => ({
    version: 3,
    assets: [{ id: 'a1', name: 'x', kind: 'video', src, durationInFrames: 30 }],
    mediaFolders: [],
    timelines: [{ id: 'tl1', name: 'Sequence 1', fps: 30, width: 1920, height: 1080, selectedId: null, items: [] } as never],
    activeTimelineId: 'tl1',
  } as never);
  const shared = '/media/uploads/shared.mp4';
  const solo = '/media/uploads/solo.mp4';
  const p1 = await createProject('Alpha', doc(shared));
  const p2 = await createProject('Beta', doc(shared));
  const p3 = await createProject('Gamma', doc(solo));

  let refs = await collectAllUploadRefs();
  assert.ok(refs.has(shared) && refs.has(solo), 'the union contains every reference');

  // after excluding p3, solo has no more references → cascade delete should remove it; shared is kept because p2 still references it
  refs = await collectAllUploadRefs(p3.id);
  assert.ok(!refs.has(solo) && refs.has(shared), 'after excluding itself: the exclusive file is left exposed, the shared one is still protected');

  // after deleting p1, shared is still referenced by p2
  await purgeProject(p1.id);
  refs = await collectAllUploadRefs();
  assert.ok(refs.has(shared), 'while a copy still exists, the shared asset\'s reference is not lost');

  for (const m of [p2, p3]) await purgeProject(m.id);
  assert.equal((await listProjectDocIds()).length, 0, 'documents are zeroed out after purge');
  console.log('collectAllUploadRefs/cascade semantics: OK');
}

console.log('\nmediaCleanup.check: ALL PASSED');
