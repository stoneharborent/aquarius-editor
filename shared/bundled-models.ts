// Models that ship inside the desktop installer, so a fresh install can
// transcribe, analyse beats and search visually without a first-use download.
//
// One list, three consumers:
//   • desktop/fetch-bundled-models.mts  — build time: downloads + verifies them
//     into resources/<BUNDLED_MODELS_DIR_NAME>/ using the pinned catalog data.
//   • desktop/seed-bundled-models.ts    — first run: copies whatever is missing
//     from app resources into ~/.openchatcut/asr-models so every existing pane
//     and runtime sees them as installed. No behaviour forks anywhere else.
//   • src/components/settings/…         — the Local models tab labels these
//     "Built in" instead of offering a download.
//
// The entries below are DERIVED from shared/asr-models.ts and
// shared/model-packs/catalog.ts — the size and SHA-256 of every file come from
// those catalogs, never from a second copy. Adding a model here means adding a
// tier id or pack id, nothing else.

import { ASR_MODELS, type AsrModelEntry } from './asr-models.ts';
import { MODEL_PACKS, type ModelPackDefinition, type ModelPackId } from './model-packs/catalog.ts';
import { LLM_MODELS, type LlmModelEntry } from './llm-model-catalog.ts';

/** Directory name under the packaged app's resources that holds the bundled files. */
export const BUNDLED_MODELS_DIR_NAME = 'bundled-models';

/** Whisper tier shipped in the installer — the catalog's recommended default. */
export const BUNDLED_ASR_MODEL_IDS: readonly AsrModelEntry['id'][] = ['small'];

/** Local intelligence packs shipped in the installer. */
export const BUNDLED_MODEL_PACK_IDS: readonly ModelPackId[] = [
  'rhythm-lite',
  'music-semantics-lite',
  'visual-semantics-lite',
];

/**
 * Language models shipped in the installer.
 *
 * EMPTY, AND IT HAS TO STAY EMPTY UNTIL THE MODEL IS SMALL ENOUGH TO FIT.
 *
 * v0.6.0 shipped the 2.33 GiB Qwen3-4B GGUF here so HyperFrames would generate
 * with nothing configured. That release could not be published at all:
 *
 *   • GitHub Releases refuses any asset of 2 GiB or more, and every artifact
 *     built with the GGUF inside it was 3.8–4.05 GiB — the Windows installer,
 *     the Linux AppImage, and both macOS DMG/ZIP pairs alike.
 *   • Windows failed even earlier: plain NSIS addresses its embedded payload
 *     with 32-bit offsets, so an installer over 2 GiB truncates. That is the
 *     "Generated installer is smaller than the embedded archive(s)" error.
 *
 * Switching Windows to `nsis-web` fixes the NSIS ceiling but not the release
 * one — it just moves the 4 GiB into a separate `.7z` asset that GitHub will
 * not host either. There is no packaging trick that makes a 2.33 GiB addition
 * fit; the payload itself has to come down.
 *
 * So the weights are not in the installer, and the app fetches them itself
 * instead: `server/builtin-llm/download.ts` downloads the same catalog-pinned
 * file, verified the same way, in the background on first launch. The model host
 * has no 2 GiB limit, which is the whole reason that channel works where this
 * one cannot. Installers stay at their v0.5.0 size and HyperFrames still ends up
 * needing no setup — it just gets there a few minutes after the first launch
 * rather than at install time.
 *
 * Re-adding an id here is a release-blocking decision, not a preference. The
 * budget is in `desktop/bundled-models-catalog.verify.ts`: the whole bundled
 * payload has to leave every installer comfortably under
 * MAX_RELEASE_ASSET_BYTES. A model only comes back here if it is small enough to
 * fit that budget — the runtime download exists precisely so nothing has to.
 */
export const BUNDLED_LLM_MODEL_IDS: readonly string[] = [];

export function isBundledAsrModel(id: string): boolean {
  return (BUNDLED_ASR_MODEL_IDS as readonly string[]).includes(id);
}

export function isBundledModelPack(id: string): boolean {
  return (BUNDLED_MODEL_PACK_IDS as readonly string[]).includes(id);
}

export function isBundledLlmModel(id: string): boolean {
  return BUNDLED_LLM_MODEL_IDS.includes(id);
}

/**
 * One file to ship. `cachePath` is relative to BOTH the resources directory and
 * the model cache root (~/.openchatcut/asr-models), so seeding is a plain copy
 * with no path translation — the same layout the download path already writes.
 */
export interface BundledModelFile {
  /** Catalog model repository, e.g. "Xenova/whisper-small". */
  readonly modelId: string;
  /** Catalog-pinned commit. Never "main". */
  readonly revision: string;
  /** Path of the file inside the model repository. */
  readonly filePath: string;
  /** Path relative to the resources dir and to the model cache root. */
  readonly cachePath: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

function asrModelFiles(entry: AsrModelEntry): BundledModelFile[] {
  const files: BundledModelFile[] = entry.files.map((file) => ({
    modelId: entry.modelId,
    revision: entry.revision,
    filePath: file.path,
    cachePath: `${entry.modelId}/${file.path}`,
    sizeBytes: file.sizeBytes,
    sha256: file.sha256,
  }));
  // The desktop whisper.cpp path reads its GGML weights from <cache>/ggml/,
  // downloaded from the whisper.cpp repository rather than the ONNX export.
  // Tiers without a pinned ggmlFile simply have nothing to ship here.
  if (entry.ggmlFile) {
    files.push({
      modelId: 'ggerganov/whisper.cpp',
      revision: entry.ggmlFile.revision,
      filePath: entry.ggmlFile.fileName,
      cachePath: `ggml/${entry.ggmlFile.fileName}`,
      sizeBytes: entry.ggmlFile.sizeBytes,
      sha256: entry.ggmlFile.sha256,
    });
  }
  return files;
}

function modelPackFiles(pack: ModelPackDefinition): BundledModelFile[] {
  return pack.files.map((file) => ({
    modelId: pack.modelId,
    revision: pack.revision,
    filePath: file.path,
    cachePath: `${pack.modelId}/${file.path}`,
    sizeBytes: file.sizeBytes,
    sha256: file.sha256,
  }));
}

function llmModelFiles(entry: LlmModelEntry): BundledModelFile[] {
  // The LLM catalog already speaks the BundledModelFile shape, cachePath
  // included, so there is nothing to translate here.
  return [{ ...entry.file }];
}

/** Every file the installer ships, derived from the pinned catalogs. */
export function bundledModelFiles(): readonly BundledModelFile[] {
  const asr = ASR_MODELS
    .filter((entry) => isBundledAsrModel(entry.id))
    .flatMap(asrModelFiles);
  const packs = MODEL_PACKS
    .filter((pack) => isBundledModelPack(pack.id))
    .flatMap(modelPackFiles);
  const llm = LLM_MODELS
    .filter((entry) => isBundledLlmModel(entry.id))
    .flatMap(llmModelFiles);
  return [...asr, ...packs, ...llm];
}

/** Uncompressed size the bundle adds to an installer's payload. */
export function bundledModelTotalBytes(): number {
  return bundledModelFiles().reduce((total, file) => total + file.sizeBytes, 0);
}
