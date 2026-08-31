// The bundled-model list must be DERIVED from the pinned catalogs, never a
// second copy of sizes, hashes or URLs. Runs offline: it only inspects the
// catalog data and the URLs the fetch script would build from it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ASR_MODELS } from '../shared/asr-models.ts';
import { MODEL_PACKS } from '../shared/model-packs/catalog.ts';
import { BUILTIN_LLM_MODEL_ID, LLM_MODELS, builtinLlmModel } from '../shared/llm-model-catalog.ts';
import {
  BUNDLED_ASR_MODEL_IDS,
  BUNDLED_LLM_MODEL_IDS,
  BUNDLED_MODELS_DIR_NAME,
  BUNDLED_MODEL_PACK_IDS,
  bundledModelFiles,
  bundledModelTotalBytes,
  isBundledAsrModel,
  isBundledLlmModel,
  isBundledModelPack,
} from '../shared/bundled-models.ts';
import { modelDownloadUrls } from '../shared/model-download-sources.ts';

const REPO_ROOT = join(import.meta.dirname, '..');

// ── What ships ────────────────────────────────────────────────────────────
assert.deepEqual([...BUNDLED_ASR_MODEL_IDS], ['small'],
  'the recommended Whisper tier is the one that ships');
assert.deepEqual([...BUNDLED_MODEL_PACK_IDS],
  ['rhythm-lite', 'music-semantics-lite', 'visual-semantics-lite'],
  'all three local intelligence packs ship');
assert.equal(isBundledAsrModel('small'), true);
assert.equal(isBundledAsrModel('medium'), false);
assert.equal(isBundledModelPack('rhythm-lite'), true);
assert.equal(isBundledModelPack('nope'), false);
// The language model that makes HyperFrames work with nothing configured.
assert.deepEqual([...BUNDLED_LLM_MODEL_IDS], [BUILTIN_LLM_MODEL_ID],
  'the built-in HyperFrames model ships');
assert.equal(isBundledLlmModel(BUILTIN_LLM_MODEL_ID), true);
assert.equal(isBundledLlmModel('nope'), false);

const files = bundledModelFiles();
const small = ASR_MODELS.find((entry) => entry.id === 'small');
assert.ok(small);

// Every file of the bundled tier, and of every bundled pack, is accounted for.
const expectedCount = small.files.length
  + (small.ggmlFile ? 1 : 0)
  + MODEL_PACKS.filter((pack) => isBundledModelPack(pack.id))
    .reduce((total, pack) => total + pack.files.length, 0)
  + LLM_MODELS.filter((entry) => isBundledLlmModel(entry.id)).length;
assert.equal(files.length, expectedCount,
  'the bundle ships every file the catalog pins for the bundled models');

// ── Pinned metadata comes from the catalogs, never from a second copy ─────
type PinnedFile = { readonly sizeBytes: number; readonly sha256: string };
for (const file of files) {
  const packFile: PinnedFile | undefined = MODEL_PACKS
    .find((pack) => pack.modelId === file.modelId && pack.revision === file.revision)
    ?.files.find((candidate) => candidate.path === file.filePath);
  const asrFile: PinnedFile | undefined = file.modelId === small.modelId
    ? small.files.find((candidate) => candidate.path === file.filePath)
    : undefined;
  const ggml: PinnedFile | undefined = small.ggmlFile?.fileName === file.filePath
    ? small.ggmlFile
    : undefined;
  const llmFile: PinnedFile | undefined = LLM_MODELS
    .find((entry) => entry.file.modelId === file.modelId
      && entry.file.revision === file.revision
      && entry.file.filePath === file.filePath)
    ?.file;
  const catalog: PinnedFile | undefined = packFile ?? asrFile ?? ggml ?? llmFile;
  assert.ok(catalog, `${file.cachePath} must come from a pinned catalog entry`);
  assert.equal(file.sizeBytes, catalog.sizeBytes, `${file.cachePath} size must match the catalog`);
  assert.equal(file.sha256, catalog.sha256, `${file.cachePath} digest must match the catalog`);
  assert.match(file.sha256, /^[a-f0-9]{64}$/, `${file.cachePath} must carry a lowercase SHA-256`);
  assert.ok(file.sizeBytes > 0, `${file.cachePath} must have a real size`);
}

// ── URLs are pinned: no "main", no hand-written host in the fetch script ──
for (const file of files) {
  assert.notEqual(file.revision, 'main', `${file.cachePath} must use a pinned revision`);
  const urls = modelDownloadUrls(file);
  assert.ok(urls.length >= 2, 'more than one mirror is available');
  for (const source of urls) {
    assert.ok(source.url.startsWith('https://'), 'model downloads are HTTPS only');
    assert.ok(source.url.includes(file.modelId), `${source.name} URL must address the pinned model`);
    assert.ok(source.url.includes(file.filePath), `${source.name} URL must address the pinned file`);
    // ModelScope addresses a repo by name and resolves its own revision; every
    // other mirror must carry the catalog-pinned commit in the path.
    if (source.name !== 'modelscope') {
      assert.ok(source.url.includes(file.revision),
        `${source.name} URL must carry the pinned revision`);
    }
  }
}

// ── The fetch script derives everything; it hardcodes nothing ─────────────
const script = readFileSync(join(REPO_ROOT, 'desktop', 'fetch-bundled-models.mts'), 'utf8');
assert.match(script, /from '\.\.\/shared\/bundled-models\.ts'/,
  'the fetch script must take its file list from the catalog-derived module');
assert.match(script, /from '\.\.\/shared\/model-download-sources\.ts'/,
  'the fetch script must take its URLs from the shared mirror list');
const code = script.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
assert.doesNotMatch(code, /https?:\/\//,
  'the fetch script must not contain a hand-written download URL');
assert.doesNotMatch(code, /\b[a-f0-9]{64}\b/,
  'the fetch script must not contain a hand-written SHA-256');

// ── Packaging wiring ─────────────────────────────────────────────────────
// Read the evaluated config rather than its source text: the directory name is a constant
// in there now, shared between extraResources and mac.signIgnore. The URL indirection is
// what update-packaging.verify.ts uses too — the config is plain untyped .mjs, so a literal
// import specifier would need a declaration file.
const builderConfigUrl = new URL('../config/electron-builder.config.mjs', import.meta.url);
const builderConfig = (await import(builderConfigUrl.href) as {
  default: { extraResources?: { from: string; to: string }[]; mac?: { signIgnore?: string[] } };
}).default;
assert.ok(
  builderConfig.extraResources?.some(
    (resource) => resource.from === `desktop-dist/${BUNDLED_MODELS_DIR_NAME}`
      && resource.to === BUNDLED_MODELS_DIR_NAME,
  ),
  'electron-builder must ship the staged bundled models as extraResources',
);
// macOS signing walks the whole bundle; the weights are inert data and are skipped there.
// The pattern has to follow BUNDLED_MODELS_DIR_NAME or it would silently stop matching.
assert.ok(
  builderConfig.mac?.signIgnore?.some((pattern) => pattern.includes(BUNDLED_MODELS_DIR_NAME)),
  'macOS signing must skip the bundled models at the directory name they are staged under',
);
// The GGUF is staged under bundled-models/llm/…, which is what puts it inside
// the signIgnore pattern above rather than beside it.
const builtinFile = builtinLlmModel().file;
assert.ok(
  files.some((file) => file.cachePath === builtinFile.cachePath),
  'the staged bundle must include the built-in language model',
);
assert.match(builtinFile.cachePath, /^llm\//,
  'GGUF weights live in their own tree under the model cache');
assert.match(
  `/Contents/Resources/${BUNDLED_MODELS_DIR_NAME}/${builtinFile.cachePath}`,
  new RegExp(builderConfig.mac!.signIgnore!.join('|')),
  'the bundled GGUF must fall inside the macOS signIgnore pattern',
);

const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};
assert.match(packageJson.scripts['fetch:bundled-models'] ?? '', /fetch-bundled-models\.mts/);
assert.match(packageJson.scripts['desktop:prebundle'] ?? '', /fetch:bundled-models/,
  'every desktop build must stage the bundled models');

// CI caches the build download directory. Its key has to hash every catalog the
// payload is derived from, or repinning a model would silently reuse stale bytes.
const workflow = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'desktop.yml'), 'utf8');
for (const catalog of [
  'shared/asr-models.ts',
  'shared/model-packs/catalog.ts',
  'shared/llm-model-catalog.ts',
  'shared/bundled-models.ts',
]) {
  assert.ok(
    workflow.includes(catalog),
    `the bundled-model cache key must hash ${catalog}`,
  );
}

const total = bundledModelTotalBytes();
console.log(
  `bundled-models-catalog.verify: ${files.length} pinned files, `
  + `${(total / (1024 ** 3)).toFixed(2)} GiB uncompressed`,
);
