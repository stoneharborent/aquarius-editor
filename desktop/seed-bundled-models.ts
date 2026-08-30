// First-run seeding of the models that ship inside the installer.
//
// The packaged app carries resources/bundled-models/ in exactly the layout the
// on-demand download path writes into ~/.openchatcut/asr-models. Seeding is
// therefore a plain per-file copy: after it runs, every existing pane, server
// endpoint and runtime sees those models as installed, with no second code
// path anywhere.
//
// Rules this module keeps:
//   • Idempotent — a file already present at the right size is left alone.
//   • Cheap when seeded — a stat() per file, never a re-hash of gigabytes.
//     The server still verifies SHA-256 before it reports a model installed.
//   • Never blocks the window — the caller fires it and forgets it.
//   • Hardlink when the copy would land on the same volume, plain copy
//     otherwise (installer resources are usually read-only, so a hardlink
//     costs nothing and a copy is the safe fallback).
//   • Restores deleted built-ins on the next launch, which is what the Local
//     models tab promises ("Built in · restored on restart").
import { copyFile, link, mkdir, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { bundledModelFiles, type BundledModelFile } from '../shared/bundled-models.ts';

export interface SeedBundledModelsOptions {
  /** Directory holding the shipped models (resources/bundled-models). */
  readonly sourceDir: string;
  /** Model cache root, i.e. modelCachePath(home). */
  readonly cacheDir: string;
  /** Defaults to the catalog-derived bundle; injectable for tests. */
  readonly files?: readonly BundledModelFile[];
}

export interface SeedBundledModelsResult {
  readonly seeded: number;
  readonly present: number;
  readonly missingFromResources: number;
  readonly failed: number;
}

async function fileSize(path: string): Promise<number | null> {
  try {
    const info = await stat(path);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}

async function placeFile(source: string, destination: string): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  await unlink(destination).catch(() => undefined);
  try {
    await link(source, destination);
  } catch {
    // EXDEV (different volume), EPERM (read-only DMG / AppImage mount) and
    // EMLINK all mean the same thing here: fall back to a real copy.
    await copyFile(source, destination);
  }
}

/**
 * Copy any missing bundled model file from app resources into the model cache.
 * Resolves with a summary; individual failures are counted, never thrown, so a
 * broken install degrades to "download it yourself" instead of a failed boot.
 */
export async function seedBundledModels(
  options: SeedBundledModelsOptions,
): Promise<SeedBundledModelsResult> {
  const files = options.files ?? bundledModelFiles();
  let seeded = 0;
  let present = 0;
  let missingFromResources = 0;
  let failed = 0;
  for (const file of files) {
    const segments = file.cachePath.split('/');
    const destination = join(options.cacheDir, ...segments);
    if (await fileSize(destination) === file.sizeBytes) {
      present += 1;
      continue;
    }
    const source = join(options.sourceDir, ...segments);
    if (await fileSize(source) !== file.sizeBytes) {
      missingFromResources += 1;
      continue;
    }
    try {
      await placeFile(source, destination);
      seeded += 1;
    } catch {
      failed += 1;
    }
  }
  return { seeded, present, missingFromResources, failed };
}
