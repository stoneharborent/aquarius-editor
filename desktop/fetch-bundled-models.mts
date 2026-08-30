// Build step: download the models that ship inside the desktop installer.
//
// What it does, in plain terms:
//   1. Ask shared/bundled-models.ts which files ship (that list is derived from
//      the pinned catalogs — no URLs, sizes or hashes are written here).
//   2. Download each missing file into a local build cache
//      (~/.openchatcut/build-model-cache, override with CC_MODEL_BUILD_CACHE),
//      trying each mirror in turn.
//   3. Check every file's byte size and SHA-256 against the catalog. A file
//      that does not match is deleted and re-fetched from the next mirror.
//   4. Copy the verified files into desktop-dist/bundled-models/, which
//      electron-builder ships as resources/bundled-models.
//
// Repeat builds re-use the cache and download nothing. Model binaries are
// never committed: both the cache and desktop-dist/ are outside git.
//
// Run it on its own with:  npm run fetch:bundled-models
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  BUNDLED_MODELS_DIR_NAME,
  bundledModelFiles,
  bundledModelTotalBytes,
  type BundledModelFile,
} from '../shared/bundled-models.ts';
import { modelDownloadUrls } from '../shared/model-download-sources.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const STAGE_DIR = join(REPO_ROOT, 'desktop-dist', BUNDLED_MODELS_DIR_NAME);
const CACHE_DIR = process.env.CC_MODEL_BUILD_CACHE
  ?? join(homedir(), '.openchatcut', 'build-model-cache');
const ATTEMPTS_PER_SOURCE = 2;

function megabytes(bytes: number): string {
  const mib = bytes / (1024 * 1024);
  return mib >= 1024 ? `${(mib / 1024).toFixed(2)} GiB` : `${mib.toFixed(1)} MiB`;
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/** A file counts as present only when its size AND digest match the catalog. */
async function verified(path: string, file: BundledModelFile): Promise<boolean> {
  try {
    if ((await stat(path)).size !== file.sizeBytes) return false;
  } catch {
    return false;
  }
  return (await sha256(path)) === file.sha256;
}

async function downloadOnce(url: string, destination: string): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  await mkdir(dirname(destination), { recursive: true });
  const partial = `${destination}.part`;
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(partial));
  await rename(partial, destination);
}

async function fetchIntoCache(file: BundledModelFile): Promise<string> {
  const cached = join(CACHE_DIR, ...file.cachePath.split('/'));
  if (await verified(cached, file)) return cached;
  await rm(cached, { force: true });
  const failures: string[] = [];
  for (const source of modelDownloadUrls(file)) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_SOURCE; attempt += 1) {
      try {
        process.stdout.write(`  ↓ ${file.cachePath} (${megabytes(file.sizeBytes)}) via ${source.name}\n`);
        await downloadOnce(source.url, cached);
        if (await verified(cached, file)) return cached;
        failures.push(`${source.name}: size or SHA-256 did not match the catalog`);
      } catch (error) {
        failures.push(`${source.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
      await rm(cached, { force: true });
      await rm(`${cached}.part`, { force: true });
    }
  }
  throw new Error(`could not fetch ${file.cachePath}\n    ${failures.join('\n    ')}`);
}

async function main(): Promise<void> {
  const files = bundledModelFiles();
  const total = bundledModelTotalBytes();
  process.stdout.write(
    `Bundled models: ${files.length} files, ${megabytes(total)} uncompressed\n`
    + `  cache: ${CACHE_DIR}\n  stage: ${STAGE_DIR}\n`,
  );
  await mkdir(STAGE_DIR, { recursive: true });
  let copied = 0;
  let reused = 0;
  for (const file of files) {
    const staged = join(STAGE_DIR, ...file.cachePath.split('/'));
    if (existsSync(staged) && await verified(staged, file)) {
      reused += 1;
      continue;
    }
    const cached = await fetchIntoCache(file);
    await mkdir(dirname(staged), { recursive: true });
    await copyFile(cached, staged);
    if (!await verified(staged, file)) {
      throw new Error(`staged copy of ${file.cachePath} failed verification`);
    }
    copied += 1;
  }
  process.stdout.write(
    `Bundled models ready: ${copied} staged, ${reused} already staged (${megabytes(total)})\n`,
  );
}

await main();
