// The local-LLM catalog is a distribution contract, not a config file: these
// bytes go inside a public AGPL installer. Runs offline — it only inspects the
// catalog data and the URLs the fetch script would build from it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BUILTIN_LLM_MODEL_ID,
  BUNDLABLE_MODEL_LICENSES,
  LLM_MODELS,
  builtinLlmModel,
  llmModel,
} from './llm-model-catalog.ts';
import { modelDownloadUrls } from './model-download-sources.ts';
import {
  BUILTIN_LLM_PROVIDER,
  BUILTIN_LLM_PROVIDER_LABEL,
  LLM_PROVIDER_PRESETS,
  isBuiltinLlmProvider,
  normalizeLlmProvider,
} from './llm-providers.ts';

// ── The catalog resolves ─────────────────────────────────────────────────────
assert.ok(LLM_MODELS.length > 0, 'the catalog must describe at least one local model');
const builtin = builtinLlmModel();
assert.equal(builtin.id, BUILTIN_LLM_MODEL_ID);
assert.equal(llmModel('not-a-model'), undefined);
assert.equal(new Set(LLM_MODELS.map((entry) => entry.id)).size, LLM_MODELS.length,
  'model ids must be unique');

for (const entry of LLM_MODELS) {
  // ── Licence: the whole reason the brief's first choice could not ship ──────
  // Qwen2.5-Coder-3B-Instruct is published under the Qwen RESEARCH licence,
  // which forbids commercial use. A weight file whose licence is not on this
  // list cannot go inside this installer, whatever its benchmarks say.
  assert.ok(
    BUNDLABLE_MODEL_LICENSES.includes(entry.license),
    `${entry.id} is licensed "${entry.license}"; only ${BUNDLABLE_MODEL_LICENSES.join(' or ')} may be bundled`,
  );
  assert.match(entry.licenseUrl, /^https:\/\//, `${entry.id} must link its licence`);
  assert.match(entry.sourceUrl, /^https:\/\/huggingface\.co\//, `${entry.id} must name where its weights come from`);
  assert.match(entry.baseModelUrl, /^https:\/\/huggingface\.co\//,
    `${entry.id} must name the upstream model it was converted from`);
  assert.ok(entry.label.trim().length > 0, `${entry.id} must have a label`);

  // ── Runtime budget ────────────────────────────────────────────────────────
  assert.ok(entry.contextSize >= 4096, `${entry.id} needs room for the prompt plus a repair loop`);
  assert.ok(entry.maxOutputTokens > 0 && entry.maxOutputTokens < entry.contextSize,
    `${entry.id} must cap its output below its context window`);

  // ── Pinning: no unpinned revision, no missing digest ──────────────────────
  const file = entry.file;
  assert.notEqual(file.revision, 'main', `${entry.id} must pin a commit, never a branch`);
  assert.match(file.revision, /^[0-9a-f]{40}$/, `${entry.id} must pin a full commit sha`);
  assert.match(file.sha256, /^[a-f0-9]{64}$/, `${entry.id} must carry a lowercase SHA-256`);
  assert.ok(file.sizeBytes > 0, `${entry.id} must record a real size`);
  assert.match(file.filePath, /\.gguf$/, `${entry.id} must ship GGUF weights for llama.cpp`);
  assert.equal(
    file.cachePath,
    `llm/${file.modelId}/${file.filePath}`,
    `${entry.id} must live under llm/ in the model cache, so seeding stays a plain copy`,
  );

  // ── Every mirror addresses the pinned bytes ───────────────────────────────
  const urls = modelDownloadUrls(file);
  assert.ok(urls.length >= 2, 'more than one mirror must be available');
  for (const source of urls) {
    assert.ok(source.url.startsWith('https://'), 'model downloads are HTTPS only');
    assert.ok(source.url.includes(file.modelId), `${source.name} URL must address the pinned repository`);
    assert.ok(source.url.includes(file.filePath), `${source.name} URL must address the pinned file`);
    if (source.name !== 'modelscope') {
      assert.ok(source.url.includes(file.revision), `${source.name} URL must carry the pinned revision`);
    }
  }
}

// ── The built-in provider identity ───────────────────────────────────────────
assert.equal(isBuiltinLlmProvider(BUILTIN_LLM_PROVIDER), true);
assert.equal(isBuiltinLlmProvider('Builtin'), true, 'the id is matched case-insensitively');
assert.equal(isBuiltinLlmProvider('anthropic'), false);
assert.equal(isBuiltinLlmProvider(undefined), false);
assert.ok(BUILTIN_LLM_PROVIDER_LABEL.length > 0);
// Deliberately not a vendor preset: every member of that list gets a keystore
// Base URL + model pair, a `llm/<id>` HTTP probe, an AI SDK factory and a slot
// in the browser Agent's model picker — none of which the built-in model has or
// could use. Adding it there would manufacture four broken surfaces.
assert.ok(
  !LLM_PROVIDER_PRESETS.some((preset) => preset.id === BUILTIN_LLM_PROVIDER),
  'the built-in model must not be a network vendor preset',
);
assert.notEqual(
  normalizeLlmProvider(BUILTIN_LLM_PROVIDER),
  BUILTIN_LLM_PROVIDER,
  'an unknown vendor id must still fall back to the default preset',
);

// ── The catalog is the only place these numbers live ─────────────────────────
const service = readFileSync(new URL('../server/builtin-llm/service.ts', import.meta.url), 'utf8');
assert.doesNotMatch(service, /\b[a-f0-9]{64}\b/,
  'the built-in LLM service must not carry a hand-written digest');
assert.doesNotMatch(service, /huggingface\.co/,
  'the built-in LLM service must not carry a hand-written download URL');

console.log(
  `llm-model-catalog.verify: ${LLM_MODELS.length} pinned model(s), `
  + `built-in = ${builtin.label} (${builtin.license}, `
  + `${(builtin.file.sizeBytes / 1024 ** 3).toFixed(2)} GiB) OK`,
);
