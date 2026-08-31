// The first-launch download of the built-in graphics model: when it starts by
// itself, what a restart sees, and what a decline is worth.
//
// No network anywhere — the transfer is injected. What is being pinned is the
// decision-making around it, which is the part that can quietly do something
// rude (pull 2.3 GiB on someone who already has an API key, or ask again after
// they said no).
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  BUILTIN_LLM_AUTO_DOWNLOAD_ENV,
  builtinLlmAutoDownloadEnabled,
  builtinLlmAutoStartDecision,
  builtinLlmDownloadInFlight,
  builtinLlmDownloadSettled,
  builtinLlmDownloadState,
  builtinLlmStatePath,
  declineBuiltinLlmDownload,
  maybeAutoStartBuiltinLlmDownload,
  pauseBuiltinLlmDownload,
  startBuiltinLlmDownload,
  __resetBuiltinLlmDownload,
  type AutoStartInput,
  type BuiltinLlmDownloadDeps,
} from './download.ts';
import { builtinLlmModelPath } from './model-file.ts';
import { builtinLlmModel } from '../../shared/llm-model-catalog.ts';
import { builtinLlmDownloadPercent, formatDownloadSize } from '../../shared/builtin-llm-download.ts';

const MODEL = builtinLlmModel();

// ── The decision matrix ──────────────────────────────────────────────────────
const READY_TO_START: AutoStartInput = {
  enabled: true,
  providerConfigured: false,
  modelPresent: false,
  declined: false,
  runtimeAvailable: true,
  inFlight: false,
};
assert.equal(builtinLlmAutoStartDecision(READY_TO_START), 'start',
  'a packaged first launch with nothing configured fetches the model');
assert.equal(
  builtinLlmAutoStartDecision({ ...READY_TO_START, enabled: false }),
  'skip-disabled',
  'a plain web dev server never pulls gigabytes on its own',
);
assert.equal(
  builtinLlmAutoStartDecision({ ...READY_TO_START, providerConfigured: true }),
  'skip-provider-configured',
  'someone who already connected a model does not need this download at all',
);
assert.equal(
  builtinLlmAutoStartDecision({ ...READY_TO_START, modelPresent: true }),
  'skip-model-present',
);
assert.equal(
  builtinLlmAutoStartDecision({ ...READY_TO_START, declined: true }),
  'skip-declined',
  'a decline survives the restart that would otherwise re-ask',
);
assert.equal(
  builtinLlmAutoStartDecision({ ...READY_TO_START, runtimeAvailable: false }),
  'skip-no-runtime',
  'never download weights this build has no way to run',
);
assert.equal(
  builtinLlmAutoStartDecision({ ...READY_TO_START, inFlight: true }),
  'skip-in-flight',
  'a second check while one is running must not start a second transfer',
);
// Precedence, where two reasons to skip are true at once. A configured provider
// is reported ahead of a missing runtime because it is the reason the user would
// recognise; a decline is reported ahead of a missing runtime so honouring the
// answer never depends on the hardware.
assert.equal(
  builtinLlmAutoStartDecision({
    ...READY_TO_START, providerConfigured: true, runtimeAvailable: false, declined: true,
  }),
  'skip-provider-configured',
);
assert.equal(
  builtinLlmAutoStartDecision({ ...READY_TO_START, declined: true, runtimeAvailable: false }),
  'skip-declined',
);

// ── The env flag ─────────────────────────────────────────────────────────────
assert.equal(builtinLlmAutoDownloadEnabled({}), false);
assert.equal(builtinLlmAutoDownloadEnabled({ [BUILTIN_LLM_AUTO_DOWNLOAD_ENV]: '0' }), false);
assert.equal(builtinLlmAutoDownloadEnabled({ [BUILTIN_LLM_AUTO_DOWNLOAD_ENV]: 'true' }), false,
  'only the exact flag counts, same as the other opt-ins in this app');
assert.equal(builtinLlmAutoDownloadEnabled({ [BUILTIN_LLM_AUTO_DOWNLOAD_ENV]: '1' }), true);

// ── The size and percentage the card renders ─────────────────────────────────
assert.equal(formatDownloadSize(MODEL.file.sizeBytes), '2.5 GB',
  'the card quotes decimal GB, the unit a download manager and an ISP use');
assert.equal(builtinLlmDownloadPercent({ bytesDone: 0, bytesTotal: 0 }), 0, 'no divide by zero');
assert.equal(builtinLlmDownloadPercent({ bytesDone: 5, bytesTotal: 10 }), 50);
assert.equal(builtinLlmDownloadPercent({ bytesDone: 99, bytesTotal: 10 }), 100, 'never past 100');

// ── An AquariusOS / overlay install has somewhere to put it ──────────────────
// The OS ships Aquarius Editor from a read-only image at
// /usr/lib/aquarius/… and updates it into an overlay directory, so anything that
// wrote next to the application would fail there. Both files this feature owns
// live under $HOME instead, which is writable in every one of those layouts —
// and neither is seeded from the packaged resources directory the way the ASR
// and analysis models are, so there is nothing for a read-only image to break.
{
  const osHome = '/home/royce';
  const cached = builtinLlmModelPath(osHome, builtinLlmModel());
  const recorded = builtinLlmStatePath(osHome);
  for (const [path, what] of [[cached, 'the weights'], [recorded, 'the decline record']] as const) {
    assert.ok(path.startsWith(`${osHome}/`), `${what} must live under the user's home directory`);
    assert.doesNotMatch(path, /\/usr\/lib\/|resources/i,
      `${what} must not land beside a read-only OS-managed install`);
  }
  assert.match(cached, /\/\.openchatcut\/asr-models\/llm\//,
    'the weights go in the shared model cache, the same tree every other local model uses');
}

// ── The task, driven end to end with an injected transfer ────────────────────
const home = await mkdtemp(join(tmpdir(), 'openchatcut-builtin-llm-'));
const modelPath = builtinLlmModelPath(home, MODEL);
const partPath = `${modelPath}.part`;

/** A transfer this test controls: it reports progress and then waits to be told. */
function controllableDownload() {
  let settle: { resolve: () => void; reject: (error: Error) => void } | null = null;
  let report: ((bytes: number) => void) | null = null;
  const download: NonNullable<BuiltinLlmDownloadDeps['download']> = async (options) => {
    report = options.onProgress;
    const deferred = Promise.withResolvers<void>();
    settle = { resolve: deferred.resolve, reject: deferred.reject };
    options.signal.addEventListener('abort', () => {
      deferred.reject(options.signal.reason instanceof Error
        ? options.signal.reason
        : new Error('aborted'));
    }, { once: true });
    await deferred.promise;
  };
  return {
    download,
    progress: (bytes: number) => report?.(bytes),
    finish: () => settle?.resolve(),
    fail: (message: string) => settle?.reject(new Error(message)),
  };
}

function deps(overrides: Partial<BuiltinLlmDownloadDeps> = {}): BuiltinLlmDownloadDeps {
  return {
    providerConfigured: () => false,
    runtimeAvailable: () => true,
    env: { [BUILTIN_LLM_AUTO_DOWNLOAD_ENV]: '1' },
    home: () => home,
    ...overrides,
  };
}

try {
  // Nothing yet: an offer, not an error, and the card knows how big it is.
  __resetBuiltinLlmDownload();
  const initial = await builtinLlmDownloadState(deps());
  assert.equal(initial.status, 'absent');
  assert.equal(initial.bytesDone, 0);
  assert.equal(initial.bytesTotal, MODEL.file.sizeBytes);
  assert.equal(initial.declined, false);
  assert.equal(initial.autoStart, true);
  assert.equal(initial.label, MODEL.label);

  // Auto-start actually runs the transfer.
  const first = controllableDownload();
  assert.equal(await maybeAutoStartBuiltinLlmDownload(deps({ download: first.download })), 'start');
  assert.equal(builtinLlmDownloadInFlight(), true);
  first.progress(MODEL.file.sizeBytes / 4);
  const running = await builtinLlmDownloadState(deps());
  assert.equal(running.status, 'downloading');
  assert.equal(builtinLlmDownloadPercent(running), 25, 'the card shows real progress, not a spinner');

  // A second launch-time check while it runs must not start a second one.
  assert.equal(
    await maybeAutoStartBuiltinLlmDownload(deps({ download: first.download })),
    'skip-in-flight',
  );

  // Pausing keeps the bytes. The real downloader leaves its `.part` behind on an
  // abort; stand one in so the resumed percentage is the one a restart sees.
  await mkdir(dirname(partPath), { recursive: true });
  await writeFile(partPath, Buffer.alloc(1024));
  const paused = await pauseBuiltinLlmDownload(deps());
  assert.equal(paused.status, 'paused');
  assert.equal(paused.bytesDone, 1024, 'a pause reports what is actually on disk');
  assert.equal(builtinLlmDownloadInFlight(), false);

  // ── Restart: a fresh process sees the partial and offers to continue ───────
  __resetBuiltinLlmDownload();
  const afterRestart = await builtinLlmDownloadState(deps());
  assert.equal(afterRestart.status, 'paused',
    'a partial on disk survives the process that was writing it');
  assert.equal(afterRestart.bytesDone, 1024);
  // …and the launch-time check picks it back up, because a paused transfer and
  // an untouched one want the same answer to "should this launch continue?".
  const second = controllableDownload();
  assert.equal(await maybeAutoStartBuiltinLlmDownload(deps({ download: second.download })), 'start');
  const resumed = await builtinLlmDownloadState(deps());
  assert.equal(resumed.status, 'downloading');
  assert.equal(resumed.bytesDone, 1024, 'the resumed run starts from the bytes already there');

  // A failure is reported, retryable, and remembered across a restart.
  second.fail('mirror closed the connection');
  await builtinLlmDownloadSettled();
  const failed = await builtinLlmDownloadState(deps());
  assert.equal(failed.status, 'error');
  assert.match(failed.error ?? '', /mirror closed/);
  __resetBuiltinLlmDownload();
  const failureRemembered = await builtinLlmDownloadState(deps());
  assert.equal(failureRemembered.status, 'error',
    'a failed download still says so after a restart, instead of looking untried');

  // ── Declining ─────────────────────────────────────────────────────────────
  const declined = await declineBuiltinLlmDownload(deps());
  assert.equal(declined.declined, true);
  const persisted = JSON.parse(await readFile(builtinLlmStatePath(home), 'utf8')) as {
    version: number; declined: boolean;
  };
  assert.equal(persisted.version, 1);
  assert.equal(persisted.declined, true, 'the answer is on disk, not in this process');
  __resetBuiltinLlmDownload();
  assert.equal(
    await maybeAutoStartBuiltinLlmDownload(deps({ download: () => { throw new Error('must not run'); } })),
    'skip-declined',
    'no launch re-asks after a decline',
  );
  // But the button still works: declining is a "not now", not a lock.
  const third = controllableDownload();
  const restarted = await startBuiltinLlmDownload(deps({ download: third.download }));
  assert.equal(restarted.status, 'downloading');
  assert.equal(restarted.declined, false, 'asking for it clears the decline');
  assert.equal(
    (JSON.parse(await readFile(builtinLlmStatePath(home), 'utf8')) as { declined: boolean }).declined,
    false,
  );

  // ── Finishing ─────────────────────────────────────────────────────────────
  // The transfer resolving is not the same as the weights being usable: the
  // state re-reads the cache, so a "done" that produced no file still reads as
  // work to do rather than a green tick over nothing.
  third.finish();
  await builtinLlmDownloadSettled();
  const withoutFile = await builtinLlmDownloadState(deps());
  assert.notEqual(withoutFile.status, 'ready',
    'readiness comes from the verified file on disk, never from a resolved promise');

  await writeFile(modelPath, Buffer.alloc(0));
  await writeFile(modelPath, Buffer.alloc(1));
  const wrongSize = await builtinLlmDownloadState(deps());
  assert.notEqual(wrongSize.status, 'ready', 'a truncated file is not a model');

  // A provider being configured is checked before anything else, so a user with
  // a key is never told about a download they will never need.
  __resetBuiltinLlmDownload();
  assert.equal(
    await maybeAutoStartBuiltinLlmDownload(deps({
      providerConfigured: () => true,
      download: () => { throw new Error('must not run'); },
    })),
    'skip-provider-configured',
  );
  assert.equal(
    await maybeAutoStartBuiltinLlmDownload(deps({
      runtimeAvailable: () => false,
      download: () => { throw new Error('must not run'); },
    })),
    'skip-no-runtime',
  );
  assert.equal(
    await maybeAutoStartBuiltinLlmDownload(deps({
      env: {},
      download: () => { throw new Error('must not run'); },
    })),
    'skip-disabled',
  );
} finally {
  __resetBuiltinLlmDownload();
  await rm(home, { recursive: true, force: true });
}

console.log('builtin-llm/download.verify: auto-start matrix, resume across restart, decline persistence OK');
