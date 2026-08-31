// The per-file download ceiling, which is a security control and not a config
// value. Runs entirely offline: every assertion here is either a pure function
// call or a `downloadModelFile` that must be rejected BEFORE it touches curl.
//
// The rule being pinned: the 2 GiB ceiling may be raised for one file, to that
// file's own length, only when a first-party catalog pins both an exact size and
// an exact SHA-256 for the exact (modelId, revision, filePath) tuple — and never
// past the 3 GiB hard cap. Anything unpinned, half-pinned, or supplied by a
// caller stays at 2 GiB.
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MAX_CACHE_FILE_BYTES,
  MAX_PINNED_CACHE_FILE_BYTES,
  cacheFileLimit,
  downloadModelFile,
  parseTarget,
  type ProxyTarget,
} from './hf-proxy.ts';
import { ASR_MODELS } from '../../shared/asr-models.ts';
import { LLM_MODELS, builtinLlmModel, llmModelFile } from '../../shared/llm-model-catalog.ts';

const builtin = builtinLlmModel().file;
const builtinTarget: ProxyTarget = {
  modelId: builtin.modelId,
  revision: builtin.revision,
  filePath: builtin.filePath,
};

// ── The two constants, and the relationship between them ─────────────────────
assert.equal(MAX_CACHE_FILE_BYTES, 2 * 1024 ** 3, 'the unpinned ceiling stays at 2 GiB');
assert.equal(MAX_PINNED_CACHE_FILE_BYTES, 3 * 1024 ** 3, 'the hard cap is 3 GiB');
assert.ok(MAX_PINNED_CACHE_FILE_BYTES > MAX_CACHE_FILE_BYTES);
for (const entry of LLM_MODELS) {
  assert.ok(
    entry.file.sizeBytes <= MAX_PINNED_CACHE_FILE_BYTES,
    `${entry.id} is ${(entry.file.sizeBytes / 1024 ** 3).toFixed(2)} GiB, past the hard cap; `
    + 'a model that big needs the cap re-argued, not the catalog edited',
  );
}

// ── Nothing gets the raise by default ────────────────────────────────────────
assert.equal(cacheFileLimit(), MAX_CACHE_FILE_BYTES, 'no target means the ordinary ceiling');
assert.equal(
  cacheFileLimit({ modelId: 'someone/else', revision: 'abc', filePath: 'weights.gguf' }),
  MAX_CACHE_FILE_BYTES,
  'a repository no catalog pins never gets the raise',
);
// The right file under a WRONG revision is a different tuple, and unpinned.
assert.equal(
  cacheFileLimit({ ...builtinTarget, revision: '0'.repeat(40) }),
  MAX_CACHE_FILE_BYTES,
  'the pin is per (modelId, revision, filePath) — a drifted revision is not pinned',
);
assert.equal(
  cacheFileLimit({ ...builtinTarget, filePath: 'Qwen3-4B-Instruct-2507-Q8_0.gguf' }),
  MAX_CACHE_FILE_BYTES,
  'a sibling quantization in the same pinned repo is not itself pinned',
);

// ── A pinned file smaller than the ordinary ceiling is not "raised" to itself ─
const asr = ASR_MODELS[0]!;
assert.ok(asr.files[0]!.sizeBytes < MAX_CACHE_FILE_BYTES);
assert.equal(
  cacheFileLimit({ modelId: asr.modelId, revision: asr.revision, filePath: asr.files[0]!.path }),
  MAX_CACHE_FILE_BYTES,
  'a small pinned file keeps the ordinary ceiling; the raise only ever moves upward',
);

// ── The one file that does get the raise, to exactly its own length ───────────
assert.ok(builtin.sizeBytes > MAX_CACHE_FILE_BYTES, 'the built-in GGUF is genuinely over 2 GiB');
assert.equal(
  cacheFileLimit(builtinTarget),
  builtin.sizeBytes,
  'the allowance is the pinned size itself — not the hard cap, not a round number',
);
assert.ok(cacheFileLimit(builtinTarget) < MAX_PINNED_CACHE_FILE_BYTES);

// ── The catalog is the source of the pin, with no second copy anywhere ───────
assert.deepEqual(
  llmModelFile(builtin.modelId, builtin.revision, builtin.filePath),
  builtin,
  'the downloader resolves the GGUF through the catalog, never a local table',
);
assert.equal(llmModelFile(builtin.modelId, builtin.revision, 'other.gguf'), undefined);
assert.equal(llmModelFile('someone/else', builtin.revision, builtin.filePath), undefined);

// ── Downloadable is not servable ─────────────────────────────────────────────
// /api/hf-proxy exists so transformers.js and whisper.cpp can read installed
// weights. Nothing in a browser can use a 2.33 GiB GGUF, and answering a request
// for one would mean hashing 2.33 GiB per request, so the serving whitelist must
// stay exactly what it was.
assert.equal(
  parseTarget(`/${builtin.modelId}/resolve/${builtin.revision}/${builtin.filePath}`),
  null,
  'the built-in GGUF must not become fetchable over the public proxy route',
);

// ── A caller cannot buy the raise with an argument ────────────────────────────
const directory = await mkdtemp(join(tmpdir(), 'openchatcut-download-cap-'));
try {
  const unpinned: ProxyTarget = { modelId: 'someone/else', revision: 'abc', filePath: 'weights.bin' };
  const destination = join(directory, 'weights.bin');
  await assert.rejects(
    downloadModelFile(unpinned, destination, { expectedBytes: builtin.sizeBytes }),
    /invalid expected model size/,
    'an unpinned download may not claim a size past the ordinary ceiling',
  );
  await assert.rejects(
    downloadModelFile(unpinned, destination, { expectedBytes: MAX_PINNED_CACHE_FILE_BYTES + 1 }),
    /invalid expected model size/,
  );
  // Exactly at the ordinary ceiling is fine as an expectation; the transfer then
  // fails for its own reasons, which an already-aborted signal supplies without
  // a single byte of network.
  const aborted = new AbortController();
  aborted.abort(new Error('do not access the network'));
  await assert.rejects(
    downloadModelFile(unpinned, destination, {
      expectedBytes: MAX_CACHE_FILE_BYTES,
      signal: aborted.signal,
    }),
    (error: unknown) => error instanceof Error && error.name === 'AbortError',
  );

  // And for the pinned tuple the catalog's numbers win outright: a caller
  // passing an absurd size is ignored rather than obeyed, so the "expectation"
  // channel cannot be used to stretch the ceiling for a file we do publish.
  await assert.rejects(
    downloadModelFile(builtinTarget, join(directory, 'builtin.gguf'), {
      expectedBytes: MAX_PINNED_CACHE_FILE_BYTES + 1,
      expectedSha256: 'f'.repeat(64),
      signal: aborted.signal,
    }),
    (error: unknown) => error instanceof Error && error.name === 'AbortError',
    'the catalog size and digest override the caller, so no size error is even reachable',
  );

  // A cache file already at the destination is only reused when it matches the
  // pin, so an oversized impostor is deleted rather than adopted.
  const impostor = join(directory, 'impostor.bin');
  await writeFile(impostor, 'not the model');
  await assert.rejects(
    downloadModelFile(builtinTarget, impostor, { signal: aborted.signal }),
    (error: unknown) => error instanceof Error && error.name === 'AbortError',
  );
  await assert.rejects(stat(impostor), { code: 'ENOENT' },
    'a file that does not match the pin is removed, never served as the model');
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log(
  'model-download-cap.verify: ceiling raised only for catalog-pinned bytes '
  + `(${(cacheFileLimit(builtinTarget) / 1024 ** 3).toFixed(2)} GiB for the built-in GGUF, `
  + `hard cap ${(MAX_PINNED_CACHE_FILE_BYTES / 1024 ** 3).toFixed(2)} GiB) OK`,
);
