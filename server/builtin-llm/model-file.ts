// Where the built-in model's weights live, and whether they are actually there.
//
// The installer seeds `resources/bundled-models/llm/…` into the model cache on
// first launch (`desktop/seed-bundled-models.ts`), so the file normally exists
// before anyone opens the Hyperframes tab. It can still be missing: a user can
// delete it, seeding can fail on a read-only mount, and the plain `npm run dev`
// web server has no installer behind it at all. Every one of those has to
// surface as "generation needs setting up", never as a silent failure — which
// is why this returns a reason rather than a boolean.
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { modelCachePath } from '../../shared/model-cache-path.ts';
import { builtinLlmModel, type LlmModelEntry } from '../../shared/llm-model-catalog.ts';

export type BuiltinLlmModelState =
  | { readonly status: 'ready'; readonly path: string; readonly model: LlmModelEntry }
  | { readonly status: 'missing'; readonly path: string; readonly model: LlmModelEntry }
  | { readonly status: 'corrupt'; readonly path: string; readonly model: LlmModelEntry; readonly sizeBytes: number };

/** Absolute path the built-in weights are seeded to. */
export function builtinLlmModelPath(
  home: string = homedir(),
  model: LlmModelEntry = builtinLlmModel(),
): string {
  return join(modelCachePath(home), ...model.file.cachePath.split('/'));
}

/**
 * Cheap readiness check, run on every `GET /api/hyperframes`. Size only: the
 * bytes were SHA-256 verified when they were downloaded at build time and again
 * when they were staged, and re-hashing 2.3 GiB to render a settings card would
 * be absurd. A truncated or half-copied file has the wrong size, which is the
 * failure this actually needs to catch.
 */
export function builtinLlmModelState(
  home: string = homedir(),
  model: LlmModelEntry = builtinLlmModel(),
  stat: (path: string) => { size: number; isFile(): boolean } = statSync,
): BuiltinLlmModelState {
  const path = builtinLlmModelPath(home, model);
  let info: { size: number; isFile(): boolean };
  try {
    info = stat(path);
  } catch {
    return { status: 'missing', path, model };
  }
  if (!info.isFile()) return { status: 'missing', path, model };
  if (info.size !== model.file.sizeBytes) {
    return { status: 'corrupt', path, model, sizeBytes: info.size };
  }
  return { status: 'ready', path, model };
}

/**
 * Why the built-in model is unusable, as a code rather than a sentence: the
 * copy is UI and belongs in the browser where `t()` can translate it. The
 * server's job is to say which of these situations this is.
 *
 * `model-downloading` is the one that is not a fault. The weights are on their
 * way — the app fetches them itself on first launch, because they are too large
 * to ship inside an installer GitHub will host — and a generation attempted
 * during that window gets told to wait rather than being handed a setup form it
 * does not need.
 */
export type BuiltinLlmProblem =
  | 'model-missing'
  | 'model-downloading'
  | 'model-corrupt'
  | 'runtime-unavailable';

export function builtinLlmModelProblem(
  state: BuiltinLlmModelState,
  downloading = false,
): BuiltinLlmProblem | null {
  if (state.status === 'ready') return null;
  if (state.status === 'corrupt') return 'model-corrupt';
  return downloading ? 'model-downloading' : 'model-missing';
}
