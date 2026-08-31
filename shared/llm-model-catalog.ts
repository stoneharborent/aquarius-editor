// The local language models the app can run itself, pinned file by file.
//
// This is the LLM sibling of `shared/asr-models.ts` and
// `shared/model-packs/catalog.ts`: one entry per model, every file identified
// by (modelId, revision, filePath) and verified by size + SHA-256. There is no
// unpinned "main" download anywhere in the pipeline — `shared/bundled-models.ts`
// derives the installer payload from here, `desktop/fetch-bundled-models.mts`
// downloads and verifies it at build time, and `desktop/seed-bundled-models.ts`
// copies it into the model cache on first launch.
//
// Weights are GGUF and run through llama.cpp (node-llama-cpp) in the built-in
// LLM worker, which is why the cache path lives under `llm/` rather than beside
// the Whisper/ONNX trees.
//
// ── Why this model ───────────────────────────────────────────────────────────
// The brief asked for Qwen2.5-Coder-3B-Instruct. It cannot ship here: every
// Qwen2.5-Coder tier except 0.5B/1.5B/7B/14B/32B is published under the Qwen
// RESEARCH licence (`license_name: qwen-research` on both the weights and the
// GGUF repository), which forbids commercial use. This repository is public and
// AGPL-3.0-or-later, and the installer is distributed as a product, so a
// research-only weight file is not an option.
//
// Qwen3-4B-Instruct-2507 is Apache-2.0 (base weights and GGUF conversion alike),
// is the non-thinking sibling of Qwen3-4B — so it answers directly instead of
// spending hundreds of tokens in a <think> block — and measured materially
// better on this app's own HyperFrames briefs than either the Apache-2.0
// Qwen2.5-Coder-1.5B (which mostly parroted the worked example) or the official
// Qwen3-4B with /no_think. Alibaba publishes no official GGUF for the 2507
// Instruct release; unsloth's conversion is the well-established one and its
// bytes are pinned by SHA-256 below, so the conversion's provenance is checked
// on every build and every download.

/** One pinned file inside a model repository. */
export interface LlmModelFile {
  /** Hugging Face repository, e.g. "unsloth/Qwen3-4B-Instruct-2507-GGUF". */
  readonly modelId: string;
  /** Pinned commit. Never "main". */
  readonly revision: string;
  /** Path of the file inside the repository. */
  readonly filePath: string;
  /**
   * Path relative to BOTH the packaged resources directory and the model cache
   * root, so seeding is a plain copy. The `llm/` prefix keeps GGUF weights in
   * their own tree, the same way whisper.cpp weights live under `ggml/`.
   */
  readonly cachePath: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface LlmModelEntry {
  readonly id: string;
  /** Shown wherever the app names the model. */
  readonly label: string;
  /** SPDX identifier. Only permissive licences may ship inside the installer. */
  readonly license: string;
  readonly licenseUrl: string;
  /** Where the weights come from, for the README and the about screen. */
  readonly sourceUrl: string;
  /** Upstream (unquantized) model these weights were converted from. */
  readonly baseModelUrl: string;
  /** Context window to open. Well under the model's trained maximum on purpose. */
  readonly contextSize: number;
  /** Ceiling for one composition. Enough for a long graphic, not a runaway. */
  readonly maxOutputTokens: number;
  readonly file: LlmModelFile;
}

/**
 * Licences a bundled model may carry. Anything else is a distribution problem
 * for a public AGPL repository, not a taste question — `llm-model-catalog.verify`
 * enforces this list.
 */
export const BUNDLABLE_MODEL_LICENSES: readonly string[] = ['Apache-2.0', 'MIT'];

/** The model HyperFrames falls back to when no vendor is configured. */
export const BUILTIN_LLM_MODEL_ID = 'hyperframes-builtin';

export const LLM_MODELS: readonly LlmModelEntry[] = [
  {
    id: BUILTIN_LLM_MODEL_ID,
    label: 'Qwen3 4B Instruct (built in)',
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/blob/main/LICENSE',
    sourceUrl: 'https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF',
    baseModelUrl: 'https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507',
    // The model trains to 262k. A composition prompt plus two repair turns fits
    // in a fraction of that, and every extra token of context is resident RAM.
    contextSize: 8192,
    maxOutputTokens: 1600,
    file: {
      modelId: 'unsloth/Qwen3-4B-Instruct-2507-GGUF',
      revision: 'a06e946bb6b655725eafa393f4a9745d460374c9',
      filePath: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
      cachePath: 'llm/unsloth/Qwen3-4B-Instruct-2507-GGUF/Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
      sizeBytes: 2_497_281_120,
      sha256: '3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597',
    },
  },
];

export function llmModel(id: string): LlmModelEntry | undefined {
  return LLM_MODELS.find((entry) => entry.id === id);
}

/** The built-in model entry. Present by construction; throws if the catalog is edited wrong. */
export function builtinLlmModel(): LlmModelEntry {
  const entry = llmModel(BUILTIN_LLM_MODEL_ID);
  if (!entry) throw new Error(`the built-in LLM catalog entry "${BUILTIN_LLM_MODEL_ID}" is missing`);
  return entry;
}
