// First-run seeding: copies bundled models out of app resources into the model
// cache. Runs entirely in a temp directory with tiny fake files — no network,
// no real model bytes.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { seedBundledModels } from './seed-bundled-models.ts';
import { bundledModelFiles, type BundledModelFile } from '../shared/bundled-models.ts';

const root = await mkdtemp(join(tmpdir(), 'cc-seed-models-'));
const sourceDir = join(root, 'resources');
const cacheDir = join(root, 'cache');

const files: readonly BundledModelFile[] = [
  {
    modelId: 'Xenova/whisper-small', revision: 'abc', filePath: 'config.json',
    cachePath: 'Xenova/whisper-small/config.json', sizeBytes: 5, sha256: 'a'.repeat(64),
  },
  {
    modelId: 'Xenova/whisper-small', revision: 'abc', filePath: 'onnx/encoder.onnx',
    cachePath: 'Xenova/whisper-small/onnx/encoder.onnx', sizeBytes: 7, sha256: 'b'.repeat(64),
  },
  {
    modelId: 'ggerganov/whisper.cpp', revision: 'def', filePath: 'ggml-small-q5_1.bin',
    cachePath: 'ggml/ggml-small-q5_1.bin', sizeBytes: 3, sha256: 'c'.repeat(64),
  },
];

async function writeFixture(base: string, file: BundledModelFile, byte = 'x'): Promise<void> {
  const path = join(base, ...file.cachePath.split('/'));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, byte.repeat(file.sizeBytes));
}

try {
  for (const file of files) await writeFixture(sourceDir, file);

  // ── Cold start: everything is copied out of resources ───────────────────
  const first = await seedBundledModels({ sourceDir, cacheDir, files });
  assert.deepEqual(first, { seeded: 3, present: 0, missingFromResources: 0, failed: 0 });
  for (const file of files) {
    const info = await stat(join(cacheDir, ...file.cachePath.split('/')));
    assert.equal(info.size, file.sizeBytes, `${file.cachePath} is seeded at its catalog size`);
  }
  // Nested paths are preserved exactly, so the server finds the files where
  // its own download path would have written them.
  await stat(join(cacheDir, 'Xenova', 'whisper-small', 'onnx', 'encoder.onnx'));
  await stat(join(cacheDir, 'ggml', 'ggml-small-q5_1.bin'));

  // ── Idempotent and cheap: a second run copies nothing ───────────────────
  const second = await seedBundledModels({ sourceDir, cacheDir, files });
  assert.deepEqual(second, { seeded: 0, present: 3, missingFromResources: 0, failed: 0 });

  // ── A user file already in place is never overwritten ───────────────────
  const userFile = join(cacheDir, 'Xenova', 'whisper-small', 'config.json');
  await writeFile(userFile, 'zzzzz');
  await seedBundledModels({ sourceDir, cacheDir, files });
  assert.equal(await readFile(userFile, 'utf8'), 'zzzzz',
    'a present file of the right size is left exactly as it is');

  // ── Deleting a built-in model restores it on the next launch ────────────
  await rm(join(cacheDir, 'ggml', 'ggml-small-q5_1.bin'));
  const third = await seedBundledModels({ sourceDir, cacheDir, files });
  assert.equal(third.seeded, 1, 'a removed built-in model comes back');
  assert.equal(third.present, 2);

  // ── A truncated cache file is replaced from resources ───────────────────
  // Remove first: a seeded file may be a hardlink to the shipped resource, and
  // writing through it would rewrite the resource too. Every mutation in the
  // app (download, delete) unlinks before writing for exactly this reason.
  const encoderPath = join(cacheDir, 'Xenova', 'whisper-small', 'onnx', 'encoder.onnx');
  await rm(encoderPath);
  await writeFile(encoderPath, 'oops');
  const fourth = await seedBundledModels({ sourceDir, cacheDir, files });
  assert.equal(fourth.seeded, 1, 'a wrong-size file is re-seeded');
  assert.equal((await stat(encoderPath)).size, 7);
  // The shipped resource is intact: seeding replaces the cache copy, never the
  // file it came from.
  assert.equal(
    (await stat(join(sourceDir, 'Xenova', 'whisper-small', 'onnx', 'encoder.onnx'))).size,
    7,
  );

  // ── A build without staged models degrades, it does not throw ───────────
  const emptyCache = join(root, 'cache-2');
  const missing = await seedBundledModels({ sourceDir: join(root, 'nothing-here'), cacheDir: emptyCache, files });
  assert.deepEqual(missing, { seeded: 0, present: 0, missingFromResources: 3, failed: 0 });

  // ── The default file list is the real catalog-derived bundle ────────────
  const defaults = bundledModelFiles();
  assert.ok(defaults.length > 3, 'the production bundle ships more than the fixture');
  const noResources = await seedBundledModels({
    sourceDir: join(root, 'nothing-here'),
    cacheDir: join(root, 'cache-3'),
  });
  assert.equal(noResources.missingFromResources, defaults.length,
    'seeding defaults to the catalog-derived bundle');

  console.log('seed-bundled-models.verify: idempotent seeding, restore-on-restart, safe degradation');
} finally {
  await rm(root, { recursive: true, force: true });
}
