// Fetching the built-in HyperFrames model, once, in the background.
//
// v0.6.0 tried to ship these weights inside the installer and could not: GitHub
// refuses a release asset of 2 GiB or more, and the GGUF alone is 2.33 GiB, so
// every artifact carrying it was unpublishable (see `shared/bundled-models.ts`).
// The model host has no such limit, so the app downloads the file itself the
// first time it opens with nothing configured — the same pinned tuple, the same
// mirrors, the same SHA-256 check the build-time fetch would have done.
//
// Everything here is deliberately boring:
//   • One file, one task, one in-flight promise. There is nothing to queue.
//   • The transfer is `downloadModelFile`, unchanged and shared with ASR tiers
//     and model packs: multi-mirror, verified, atomic rename at the end. This
//     module owns *when* and *whether*, never *how*.
//   • Nothing blocks the window. The auto-start is a timer the server sets and
//     forgets; a failure logs and leaves the setup card exactly as it was.
//   • A decline is remembered on disk. Being asked twice is the thing people
//     actually hate.
import { stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { BuiltinLlmDownloadState } from '../../shared/builtin-llm-download.ts';
import { builtinLlmModel, type LlmModelEntry } from '../../shared/llm-model-catalog.ts';
import { downloadModelFile } from '../plugins/hf-proxy.ts';
import { builtinLlmModelPath, builtinLlmModelState } from './model-file.ts';
import { builtinLlmRuntimeAvailable } from './service.ts';

/**
 * Opt-in flag for automatic downloading. The packaged desktop app sets it on
 * itself before the embedded server starts; a developer sets it by hand to
 * exercise the flow in `npm run dev`. A plain web dev server does nothing on its
 * own — pulling 2.3 GiB because someone ran a dev command would be rude.
 */
export const BUILTIN_LLM_AUTO_DOWNLOAD_ENV = 'CC_BUILTIN_LLM_AUTO_DOWNLOAD';

/** Wait this long after boot before starting, so the window paints first. */
export const AUTO_DOWNLOAD_DELAY_MS = 4_000;

/**
 * Remembered across launches, and deliberately NOT in the settings keystore: the
 * keystore can live inside a relocatable storage root, and this has to be
 * readable before anything else resolves. Same fixed-location reasoning as
 * `server/data-dir.ts`.
 */
export function builtinLlmStatePath(home: string = homedir()): string {
  return join(home, '.openchatcut', 'builtin-llm.json');
}

interface PersistedState {
  declined: boolean;
  /** The last failure, so a restart can still show what went wrong. */
  error?: string;
}

function readPersisted(home: string = homedir()): PersistedState {
  try {
    const parsed: unknown = JSON.parse(readFileSync(builtinLlmStatePath(home), 'utf8'));
    if (!parsed || typeof parsed !== 'object') return { declined: false };
    const record = parsed as Record<string, unknown>;
    return {
      declined: record.declined === true,
      ...(typeof record.error === 'string' && record.error ? { error: record.error } : {}),
    };
  } catch {
    // A missing or corrupt file means "nothing decided yet", which is the safe
    // reading: the worst case is offering a download the user already declined
    // once, never starting one they refused in this session.
    return { declined: false };
  }
}

async function writePersisted(next: PersistedState, home: string = homedir()): Promise<void> {
  const path = builtinLlmStatePath(home);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ version: 1, ...next }, null, 2)}\n`, { mode: 0o600 });
}

// ── The decision ────────────────────────────────────────────────────────────

export interface AutoStartInput {
  /** The env flag, or the packaged app setting it on itself. */
  readonly enabled: boolean;
  /** True when the user has already chosen a vendor or a local runtime. */
  readonly providerConfigured: boolean;
  /** True when verified weights are already in the model cache. */
  readonly modelPresent: boolean;
  /** True once the user has said no. */
  readonly declined: boolean;
  /** True when node-llama-cpp resolves on this platform. */
  readonly runtimeAvailable: boolean;
  /** True when a transfer is already running in this process. */
  readonly inFlight: boolean;
}

export type AutoStartDecision =
  | 'start'
  | 'skip-disabled'
  | 'skip-provider-configured'
  | 'skip-model-present'
  | 'skip-declined'
  | 'skip-no-runtime'
  | 'skip-in-flight';

/**
 * Whether this launch should fetch the weights by itself. Pure, ordered, and
 * exhaustive so the matrix can be read straight off the verify.
 *
 * Order matters. "The user configured a provider" is checked before "the model
 * is missing", because someone with an API key never needed this download and
 * should not be told about it. "Declined" is checked before "no runtime" so a
 * decline is honoured even on a machine that could have run the model. A
 * partial download is not a state here at all: it resumes through the ordinary
 * `start` path, because a paused 60% transfer and an untouched 0% one want the
 * same answer to "should this launch continue?".
 */
export function builtinLlmAutoStartDecision(input: AutoStartInput): AutoStartDecision {
  if (!input.enabled) return 'skip-disabled';
  if (input.inFlight) return 'skip-in-flight';
  if (input.providerConfigured) return 'skip-provider-configured';
  if (input.modelPresent) return 'skip-model-present';
  if (input.declined) return 'skip-declined';
  if (!input.runtimeAvailable) return 'skip-no-runtime';
  return 'start';
}

// ── The task ────────────────────────────────────────────────────────────────

interface Task {
  status: 'downloading' | 'paused' | 'error';
  bytesDone: number;
  error?: string;
}

let task: Task | null = null;
let controller: AbortController | null = null;
let flight: Promise<void> | null = null;

/**
 * Where `downloadModelFile` parks an unfinished transfer. Same `.part` suffix it
 * uses itself — this module reads that file rather than keeping a byte count of
 * its own, so a percentage shown after a restart is the truth on disk and not a
 * number some previous process remembered.
 */
function partPath(model: LlmModelEntry, home: string): string {
  return `${builtinLlmModelPath(home, model)}.part`;
}

/** Bytes already on disk for an interrupted transfer, for the resumed percentage. */
async function partialBytes(model: LlmModelEntry, home: string): Promise<number> {
  const size = await stat(partPath(model, home))
    .then((info) => (info.isFile() ? info.size : 0))
    .catch(() => 0);
  return size > 0 && size < model.file.sizeBytes ? size : 0;
}

export function builtinLlmAutoDownloadEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env[BUILTIN_LLM_AUTO_DOWNLOAD_ENV] === '1';
}

export interface BuiltinLlmDownloadDeps {
  /** True when the user configured a vendor or local runtime for HyperFrames. */
  readonly providerConfigured: () => boolean;
  readonly runtimeAvailable?: () => boolean;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly home?: () => string;
  /** Injectable transfer; defaults to the shared model downloader. */
  readonly download?: (options: {
    signal: AbortSignal;
    onProgress: (bytes: number) => void;
  }) => Promise<void>;
}

function defaultDownload(model: LlmModelEntry) {
  return async (options: { signal: AbortSignal; onProgress: (bytes: number) => void }) => {
    await downloadModelFile(
      {
        modelId: model.file.modelId,
        revision: model.file.revision,
        filePath: model.file.filePath,
      },
      builtinLlmModelPath(homedir(), model),
      {
        signal: options.signal,
        onProgress: options.onProgress,
        // The catalog already pins the size and digest for this tuple, so the
        // downloader takes them from there; passing them again would be a
        // second copy of the numbers. `resume` is what makes a 2.3 GiB transfer
        // survive a quit.
        resume: true,
      },
    );
  };
}

/** Read-only snapshot for `GET /api/builtin-llm` and for the auto-start check. */
export async function builtinLlmDownloadState(
  deps: BuiltinLlmDownloadDeps,
): Promise<BuiltinLlmDownloadState> {
  const model = builtinLlmModel();
  const home = deps.home?.() ?? homedir();
  const persisted = readPersisted(home);
  const runtimeAvailable = (deps.runtimeAvailable ?? builtinLlmRuntimeAvailable)();
  const autoStart = builtinLlmAutoDownloadEnabled(deps.env ?? process.env);
  const base = {
    bytesTotal: model.file.sizeBytes,
    label: model.label,
    declined: persisted.declined,
    autoStart,
    runtimeAvailable,
  };
  if (builtinLlmModelState(home, model).status === 'ready') {
    return { ...base, status: 'ready', bytesDone: model.file.sizeBytes, declined: false };
  }
  if (task?.status === 'downloading') {
    return { ...base, status: 'downloading', bytesDone: task.bytesDone };
  }
  const partial = await partialBytes(model, home);
  // A failure outranks the leftover bytes it left behind. "Failed at 43%, try
  // again" is the true sentence; showing "paused at 43%" would quietly blame the
  // user for a mirror that hung up on them. The remembered error carries the
  // same reading across a restart.
  const error = task?.status === 'error' ? (task.error ?? 'Download failed') : persisted.error;
  if (error) return { ...base, status: 'error', bytesDone: partial, error };
  if (task?.status === 'paused' || partial > 0) {
    return { ...base, status: 'paused', bytesDone: partial };
  }
  return { ...base, status: 'absent', bytesDone: 0 };
}

/**
 * Start (or resume) the transfer. Idempotent: calling it while one is running
 * returns the running one. Starting always clears a previous decline — the only
 * way to reach here is an explicit request or an auto-start that already checked
 * the decline.
 */
export async function startBuiltinLlmDownload(
  deps: BuiltinLlmDownloadDeps,
): Promise<BuiltinLlmDownloadState> {
  const model = builtinLlmModel();
  const home = deps.home?.() ?? homedir();
  if (task?.status !== 'downloading') {
    // Claim the slot BEFORE the first await. Two clicks a few milliseconds apart
    // would otherwise both pass the check above and both start a transfer into
    // the same `.part` file; the digest would catch the mess afterwards, but
    // only after spending someone's connection twice to make it.
    const current: Task = { status: 'downloading', bytesDone: 0 };
    task = current;
    await writePersisted({ declined: false }, home).catch(() => undefined);
    current.bytesDone = await partialBytes(model, home);
    const abort = new AbortController();
    controller = abort;
    const run = (deps.download ?? defaultDownload(model))({
      signal: abort.signal,
      onProgress: (bytes) => {
        // The downloader reports bytes written in THIS transfer; a resumed one
        // starts its count above zero because curl appends to the same file, so
        // the number is already absolute. Clamp anyway: a progress tick that
        // outran the total would render a card claiming 104%.
        current.bytesDone = Math.max(current.bytesDone, Math.min(bytes, model.file.sizeBytes));
      },
    });
    // The bookkeeping is INSIDE the promise, so anything awaiting `flight` sees
    // a settled task and a written state file rather than a race.
    flight = run.then(async () => {
      if (task !== current) return;
      // Done means the weights landed; readiness itself is re-read from disk, so
      // clearing the task is all this has to do.
      task = null;
      await writePersisted({ declined: false }, home).catch(() => undefined);
    }, async (error: unknown) => {
      if (task !== current) return;
      if (abort.signal.aborted) {
        current.status = 'paused';
        return;
      }
      current.status = 'error';
      current.error = error instanceof Error ? error.message : String(error);
      await writePersisted({ declined: false, error: current.error }, home).catch(() => undefined);
    }).finally(() => {
      if (controller === abort) controller = null;
    });
    void flight;
  }
  return builtinLlmDownloadState(deps);
}

/** Stop the transfer but keep the bytes: the next start continues from here. */
export async function pauseBuiltinLlmDownload(
  deps: BuiltinLlmDownloadDeps,
): Promise<BuiltinLlmDownloadState> {
  const pending = flight;
  controller?.abort(new Error('Built-in model download paused'));
  await pending?.catch(() => undefined);
  if (task?.status === 'downloading') task = { status: 'paused', bytesDone: task.bytesDone };
  return builtinLlmDownloadState(deps);
}

/**
 * "No thanks." Stops anything running and remembers the answer, so no later
 * launch offers it again by itself. The manual button stays — declining is not
 * a door that locks.
 */
export async function declineBuiltinLlmDownload(
  deps: BuiltinLlmDownloadDeps,
): Promise<BuiltinLlmDownloadState> {
  const home = deps.home?.() ?? homedir();
  await pauseBuiltinLlmDownload(deps);
  await writePersisted({ declined: true }, home);
  return builtinLlmDownloadState(deps);
}

/**
 * The launch-time hook. Resolves to what it decided, so the caller can log one
 * line and a verify can assert the matrix end to end.
 */
export async function maybeAutoStartBuiltinLlmDownload(
  deps: BuiltinLlmDownloadDeps,
): Promise<AutoStartDecision> {
  const home = deps.home?.() ?? homedir();
  const decision = builtinLlmAutoStartDecision({
    enabled: builtinLlmAutoDownloadEnabled(deps.env ?? process.env),
    providerConfigured: deps.providerConfigured(),
    modelPresent: builtinLlmModelState(home).status === 'ready',
    declined: readPersisted(home).declined,
    runtimeAvailable: (deps.runtimeAvailable ?? builtinLlmRuntimeAvailable)(),
    inFlight: task?.status === 'downloading',
  });
  if (decision === 'start') await startBuiltinLlmDownload(deps);
  return decision;
}

/** True while bytes are moving — the HyperFrames route says so in its problem code. */
export function builtinLlmDownloadInFlight(): boolean {
  return task?.status === 'downloading';
}

/**
 * Resolves once the current transfer has finished AND recorded what happened.
 * Used by pause, and by anything that needs the state file to be settled before
 * it reads it.
 */
export function builtinLlmDownloadSettled(): Promise<void> {
  return (flight ?? Promise.resolve()).catch(() => undefined);
}

/** Test seam: forget the in-process task without touching the disk. */
export function __resetBuiltinLlmDownload(): void {
  controller?.abort(new Error('Built-in model download state reset'));
  controller = null;
  task = null;
  flight = null;
}
