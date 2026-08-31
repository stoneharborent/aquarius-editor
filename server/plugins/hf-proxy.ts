// GET /api/hf-proxy/<owner>/<repo>/resolve/<rev>/<path...>
// Serves only verified files from installed catalog model packs. Network
// downloads are initiated exclusively by authenticated model-pack mutations.
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, open, rename, stat, unlink, type FileHandle } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ASR_MODELS, asrModelFile, type AsrModelFile } from '../../shared/asr-models.ts';
import { modelCachePath } from '../../shared/model-cache-path.ts';
import { MODEL_DOWNLOAD_SOURCES } from '../../shared/model-download-sources.ts';
import { proxyCurlArgs } from '../outbound-proxy.ts';
import { MODEL_PACKS, type ModelPackFile } from '../../shared/model-packs/catalog.ts';
import { llmModelFile, type LlmModelFile } from '../../shared/llm-model-catalog.ts';
import {
  fileMatchesIntegrity,
  openContainedVerifiedFile,
} from './hf-integrity.ts';

const MODEL_ID = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/;
const REV = /^[A-Za-z0-9_.-]+$/;
const SEGMENT = /^[A-Za-z0-9_.-]+$/;
/**
 * Ceiling for any file whose exact bytes are NOT pinned by a first-party
 * catalog. This is the number that stops a compromised or drifting mirror from
 * filling the disk with something nobody asked for, so it stays where it was.
 */
export const MAX_CACHE_FILE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB
/**
 * Absolute ceiling, pinned or not. The built-in HyperFrames GGUF is 2.33 GiB —
 * genuinely larger than the unpinned limit — and the app has to be able to fetch
 * it, because GitHub will not host a release asset of 2 GiB or more and so the
 * weights cannot ride inside the installer (see `shared/bundled-models.ts`).
 *
 * The raise is deliberately NOT "the limit is now 3 GiB". It is: a file that a
 * first-party catalog pins with an exact size AND an exact SHA-256 may spend up
 * to its own pinned size, and nothing may ever exceed this hard number. So the
 * allowance is per-entry, is bounded above by bytes we published ourselves, and
 * an unpinned or caller-supplied expectation can never reach past
 * MAX_CACHE_FILE_BYTES. `cacheFileLimit` below is the only place that decides.
 */
export const MAX_PINNED_CACHE_FILE_BYTES = 3 * 1024 * 1024 * 1024; // 3 GiB
const CURL_TIMEOUT_S = 1800;
const CURL_ROUNDS = 6; // each round also retries internally (--retry 8)
const PARALLEL_CHUNKS = 4; // per-connection throttling → parallel byte ranges
const PARALLEL_MIN_BYTES = 8 * 1024 * 1024;

/**
 * Download sources in priority order, shared with the build-time bundled-model
 * fetch (shared/model-download-sources.ts). The official source uses parallel
 * ranges; mirrors fall back to single-stream.
 */
const SOURCES = MODEL_DOWNLOAD_SOURCES;

/**
 * Session-scoped "source does not visibly host this model" cache. Populated only
 * after a deterministic not-found failure (HTTP 404 or a mirror's own missing-repo
 * payload) on a source for a given modelId. Once recorded, later files of the same
 * model skip that source entirely instead of burning the doomed source's retry
 * rounds again. Keyed by modelId so a mirror that later gains the model is not
 * masked globally — a fresh session re-probes it. Transient failures (timeouts,
 * 5xx) never land here.
 */
const absentSourcesByModel = new Map<string, Set<string>>();

function sourceMissingOnError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  // curl `--fail` exits 22 on any HTTP error; a genuine mirror absence surfaces
  // as an HTTP 404 in the stderr tail. Transient failures give other exit codes.
  if (/curl exit 22\b[\s\S]{0,200}\b404\b/i.test(message)) return true;
  // ModelScope reports a missing repo as JSON `{"Code":10990101007,...}`.
  if (/"Code"\s*:\s*10990101007/i.test(message)) return true;
  return false;
}
/** Pure classifier exposed for verifies: does this failure mean the source lacks the model? */
export { sourceMissingOnError };

function isSourceAbsent(modelId: string, sourceName: string): boolean {
  return absentSourcesByModel.get(modelId)?.has(sourceName) ?? false;
}

function markSourceAbsent(modelId: string, sourceName: string): void {
  let absent = absentSourcesByModel.get(modelId);
  if (!absent) {
    absent = new Set();
    absentSourcesByModel.set(modelId, absent);
  }
  absent.add(sourceName);
}

/** Test hook: clear the session-scoped absent-source cache. */
export function __resetModelMissingState(): void {
  absentSourcesByModel.clear();
}

/** Test hook: frozen snapshot of which (modelId, source) are marked absent. */
export function __getAbsentSourcesForVerify(): ReadonlyMap<string, readonly string[]> {
  return new Map([...absentSourcesByModel].map(([modelId, set]) => [modelId, [...set]]));
}

/** Shared user-data cache; never exposed through public/ or bundled into dist. */
export function modelCacheDir(): string {
  return modelCachePath(homedir());
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.destroyed || res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function contentTypeOf(file: string): string {
  if (file.endsWith('.json')) return 'application/json';
  if (file.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

export interface ProxyTarget { modelId: string; revision: string; filePath: string }

/**
 * Catalog files this server will SERVE over /api/hf-proxy — model packs and ASR
 * tiers, i.e. the things transformers.js and whisper.cpp fetch through the
 * proxy. The LLM catalog is deliberately absent: nothing in the browser can use
 * a 2.33 GiB GGUF, and answering a request for one would mean SHA-256ing 2.33
 * GiB per request. Downloading it is a different question — `pinnedModelFile`
 * below is what the downloader asks.
 */
function fixedModelFile(target: ProxyTarget): ModelPackFile | AsrModelFile | undefined {
  for (const pack of MODEL_PACKS) {
    if (pack.modelId !== target.modelId || pack.revision !== target.revision) continue;
    const file = pack.files.find((candidate) => candidate.path === target.filePath);
    if (file) return file;
  }
  return asrModelFile(target.modelId, target.revision, target.filePath);
}

/** What a first-party catalog pins for this exact tuple: exact size, exact digest. */
export interface PinnedFileIntegrity {
  readonly sizeBytes: number;
  readonly sha256: string;
}

/**
 * Every first-party catalog the DOWNLOADER trusts: packs, ASR tiers, and the
 * local-LLM catalog. One lookup, no second copy of any size, digest or URL —
 * `shared/llm-model-catalog.ts` remains the single source of truth for the GGUF.
 */
function pinnedModelFile(target: ProxyTarget): PinnedFileIntegrity | undefined {
  const servable = fixedModelFile(target);
  if (servable) return servable;
  const llm: LlmModelFile | undefined = llmModelFile(target.modelId, target.revision, target.filePath);
  return llm;
}

/** A pin only counts when both halves are real — an exact size and a lowercase digest. */
function pinIsExact(pin: PinnedFileIntegrity | undefined): pin is PinnedFileIntegrity {
  return !!pin
    && Number.isSafeInteger(pin.sizeBytes)
    && pin.sizeBytes > 0
    && /^[a-f0-9]{64}$/.test(pin.sha256);
}

/**
 * How many bytes this one file may occupy. THE security decision in this module.
 *
 *   • No target, or a target no first-party catalog pins → MAX_CACHE_FILE_BYTES.
 *   • A catalog entry missing an exact size or a lowercase SHA-256 → the same;
 *     a half-written pin buys nothing.
 *   • A fully pinned entry → exactly its own pinned size, and never more than
 *     MAX_PINNED_CACHE_FILE_BYTES whatever the catalog claims.
 *
 * So the ceiling is only ever raised for bytes we published, to the exact length
 * we published, and the file is still SHA-256 verified before it is kept. There
 * is no argument, header or request shape that reaches the raised limit.
 */
export function cacheFileLimit(target?: ProxyTarget): number {
  if (!target) return MAX_CACHE_FILE_BYTES;
  const pin = pinnedModelFile(target);
  if (!pinIsExact(pin)) return MAX_CACHE_FILE_BYTES;
  if (pin.sizeBytes <= MAX_CACHE_FILE_BYTES) return MAX_CACHE_FILE_BYTES;
  return Math.min(pin.sizeBytes, MAX_PINNED_CACHE_FILE_BYTES);
}

/** Parse an encoded proxy path and accept only exact catalog file tuples. */
export function parseTarget(rawPath: string): ProxyTarget | null {
  const encodedPath = rawPath.split('?', 1)[0] ?? '';
  const encoded = encodedPath.startsWith('/') ? encodedPath.slice(1) : encodedPath;
  if (!encoded || encoded.includes('\\') || /%(?:2f|5c)/i.test(encoded)) return null;
  let clean: string;
  try {
    clean = decodeURIComponent(encoded);
  } catch (error) {
    if (error instanceof URIError) return null;
    throw error;
  }
  const parts = clean.split('/');
  if (parts.some((segment) => !segment || segment === '.' || segment === '..')) return null;
  if (parts.length < 5 || parts[2] !== 'resolve') return null;
  const modelId = `${parts[0]}/${parts[1]}`;
  const revision = parts[3] ?? '';
  const fileParts = parts.slice(4);
  if (!MODEL_ID.test(modelId) || !REV.test(revision)) return null;
  if (fileParts.some((segment) => !SEGMENT.test(segment))) return null;
  const target = { modelId, revision, filePath: fileParts.join('/') };
  if (fixedModelFile(target)) return target;
  // transformers.js v4 probes config/tokenizer files with revision "main"
  // (its get_files path drops the pinned revision). Resolve "main" to the
  // catalog-pinned revision so the whitelist keeps serving the exact locked
  // file tuple (same sha-verified bytes, just a different URL segment).
  if (revision === 'main') {
    const entry = ASR_MODELS.find((model) => model.modelId === modelId);
    if (entry) {
      const pinned: ProxyTarget = { modelId, revision: entry.revision, filePath: target.filePath };
      if (fixedModelFile(pinned)) return pinned;
    }
  }
  return null;
}

export interface DownloadModelFileOptions {
  signal?: AbortSignal; onProgress?: (bytes: number) => void;
  expectedBytes?: number; expectedSha256?: string;
  /**
   * Continue an existing `.part` from where it stopped instead of discarding it.
   * Off by default: a multi-gigabyte transfer is the only case where restarting
   * actually hurts, and resuming forces the single-stream path (curl `-C -`), so
   * a small file would give up its parallel ranges for nothing. Resuming is
   * still safe across mirrors — they serve byte-identical files, and the whole
   * result is SHA-256 verified before it is kept — and a resume that fails
   * verification throws the partial away rather than keeping it.
   */
  resume?: boolean;
}

interface CurlContext extends DownloadModelFileOptions {
  progress: Map<string, number>;
  /** Per-file byte ceiling from `cacheFileLimit`; never the raw constant. */
  limit: number;
}

function downloadAborted(signal?: AbortSignal): Error {
  const error = signal?.reason instanceof Error ? signal.reason : new Error('Model download cancelled');
  error.name = 'AbortError';
  return error;
}

function throwIfDownloadAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw downloadAborted(signal);
}

async function reportFileProgress(context: CurlContext, path: string): Promise<void> {
  if (!context.onProgress) return;
  const bytes = await stat(path).then((value) => value.size).catch(() => 0);
  context.progress.set(path, bytes);
  context.onProgress([...context.progress.values()].reduce((sum, value) => sum + value, 0));
}

function runCurl(
  url: string, out: string, range: string | undefined, maxBytes: number, context: CurlContext,
  noProxy = false,
): Promise<void> {
  throwIfDownloadAborted(context.signal);
  const transferLimit = Math.min(context.limit, maxBytes + 64 * 1024);
  const args = [
    '-sSL', '--fail', '--max-time', String(CURL_TIMEOUT_S),
    '--max-filesize', String(transferLimit),
    '--speed-limit', '1024', '--speed-time', '30',
    // Deliberately WITHOUT `--retry-all-errors`: that flag makes curl retry
    // deterministic 4xx failures (e.g. a 404 "file not found" on a source that
    // does not mirror the repo), which just burns ~27s of retry delays per
    // round on a doomed source before the outer source loop can fall through.
    // `--retry 8` still handles transient errors (408/429/5xx, timeouts,
    // resets), and the outer CURL_ROUNDS loop retries the whole transfer.
    '--retry', '8', '--retry-delay', '3',
    // ModelScope is a domestic CDN: force direct connection (no proxy);
    // other sources keep the configured outbound proxy.
    ...(noProxy ? ['--noproxy', '*'] : proxyCurlArgs()),
  ];
  if (range) args.push('-r', range);
  else args.push('-C', '-');
  args.push('-o', out, url);
  return new Promise<void>((resolve, reject) => {
    const child = spawn('curl', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;
    const timer = context.onProgress
      ? setInterval(() => void reportFileProgress(context, out), 250)
      : undefined;
    const cleanup = () => {
      clearInterval(timer);
      context.signal?.removeEventListener('abort', onAbort);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      void reportFileProgress(context, out);
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => child.kill('SIGTERM');
    context.signal?.addEventListener('abort', onAbort, { once: true });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += String(chunk);
      if (stderr.length > 4000) stderr = stderr.slice(-2000);
    });
    child.once('error', (error) => finish(error));
    child.once('close', (code) => {
      if (context.signal?.aborted) finish(downloadAborted(context.signal));
      else if (code === 0) finish();
      else finish(new Error(`model download failed (curl exit ${code}): ${stderr.slice(-300)}`));
    });
  });
}

async function downloadSingle(
  url: string, tmpPath: string, context: CurlContext, noProxy = false,
): Promise<void> {
  let lastError: unknown;
  for (let round = 0; round < CURL_ROUNDS; round += 1) {
    throwIfDownloadAborted(context.signal);
    try {
      await runCurl(url, tmpPath, undefined, context.expectedBytes ?? context.limit, context, noProxy);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function probeRemoteSize(
  url: string,
  expectedBytes: number | undefined,
  limit: number,
  signal?: AbortSignal,
): Promise<number> {
  throwIfDownloadAborted(signal);
  return new Promise<number>((resolve, reject) => {
    const child = spawn('curl', ['-sS', '--max-time', '60', '-L', '-r', '0-0', '-D', '-', '-o', '/dev/null', url], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    const onAbort = () => child.kill('SIGTERM');
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout?.on('data', (chunk: Buffer) => { stdout += String(chunk); });
    child.once('error', (error) => { cleanup(); reject(error); });
    child.once('close', (code) => {
      cleanup();
      if (signal?.aborted) { reject(downloadAborted(signal)); return; }
      if (code !== 0) { reject(new Error(`range probe failed (curl exit ${code})`)); return; }
      const match = /content-range:\s*bytes\s+\d+-\d+\/(\d+)/i.exec(stdout);
      const size = match ? Number(match[1]) : NaN;
      if (!Number.isFinite(size) || size <= 0 || size > limit) {
        reject(new Error(`invalid content-range: ${stdout.slice(0, 160)}`));
        return;
      }
      if (expectedBytes !== undefined && size !== expectedBytes) {
        reject(new Error(`remote model size mismatch: got ${size}, expected ${expectedBytes}`));
        return;
      }
      resolve(size);
    });
  });
}

export type PartStreamFactory = (path: string) => AsyncIterable<Buffer | Uint8Array | string>;

async function writeEntireChunk(file: FileHandle, chunk: Buffer): Promise<void> {
  let offset = 0;
  while (offset < chunk.length) {
    const { bytesWritten } = await file.write(chunk, offset, chunk.length - offset);
    if (bytesWritten <= 0) throw new Error('parallel download merge made no write progress');
    offset += bytesWritten;
  }
}

/** Merge range-download parts in order while retaining only one stream chunk. */
export async function mergeDownloadedParts(
  partPaths: readonly string[],
  destinationPath: string,
  expectedSize: number,
  streamFactory: PartStreamFactory = (path) => createReadStream(path),
): Promise<void> {
  const destination = await open(destinationPath, 'w');
  let total = 0;
  try {
    for (const partPath of partPaths) {
      for await (const value of streamFactory(partPath)) {
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
        total += chunk.length;
        if (total > expectedSize) break;
        await writeEntireChunk(destination, chunk);
      }
      if (total > expectedSize) break;
    }
  } finally {
    await destination.close();
  }
  if (total !== expectedSize) {
    throw new Error(`parallel download size mismatch: got ${total}, expected ${expectedSize}`);
  }
}

export async function settlePartDownloadRound(
  tasks: readonly (() => Promise<void>)[],
): Promise<unknown | null> {
  const results = await Promise.allSettled(tasks.map(async (task) => task()));
  const failure = results.find((result) => result.status === 'rejected');
  return failure?.reason ?? null;
}

async function downloadParallel(url: string, size: number, tmpPath: string, context: CurlContext): Promise<void> {
  const chunkSize = Math.ceil(size / PARALLEL_CHUNKS);
  const parts = Array.from({ length: PARALLEL_CHUNKS }, (_, index) => {
    const start = index * chunkSize;
    const end = index === PARALLEL_CHUNKS - 1 ? size - 1 : (index + 1) * chunkSize - 1;
    return { file: `${tmpPath}.${index}`, range: `${start}-${end}`, bytes: end - start + 1 };
  });
  await Promise.all(parts.map((part) => unlink(part.file).catch(() => undefined)));
  try {
    let lastError: unknown;
    for (let round = 0; round < CURL_ROUNDS; round += 1) {
      throwIfDownloadAborted(context.signal);
      lastError = await settlePartDownloadRound(parts.map((part) => (
        () => runCurl(url, part.file, part.range, part.bytes, context)
      )));
      if (!lastError) break;
    }
    if (lastError) throw lastError;
    await mergeDownloadedParts(parts.map((part) => part.file), tmpPath, size);
    context.onProgress?.(size);
  } finally {
    await Promise.all(parts.map((part) => unlink(part.file).catch(() => undefined)));
  }
}

async function downloadFromSource(
  source: (typeof SOURCES)[number],
  target: ProxyTarget,
  tmpPath: string,
  context: CurlContext,
  /** Bytes already on disk in `tmpPath` that this attempt should continue from. */
  resumeFrom = 0,
): Promise<void> {
  const url = source.url(target);
  if (source.name === 'modelscope') {
    // Domestic CDN, single-stream, direct connection.
    await downloadSingle(url, tmpPath, context, true);
    return;
  }
  if (source.name !== 'huggingface') {
    await downloadSingle(url, tmpPath, context);
    return;
  }
  // A resume continues one byte stream, so it cannot use split ranges: the
  // parallel path writes its own part files and merges them over tmpPath, which
  // would throw the resumed prefix away.
  if (resumeFrom > 0) {
    await downloadSingle(url, tmpPath, context);
    return;
  }
  const size = await probeRemoteSize(url, context.expectedBytes, context.limit, context.signal);
  if (size < PARALLEL_MIN_BYTES) {
    await downloadSingle(url, tmpPath, context);
    return;
  }
  await downloadParallel(url, size, tmpPath, context);
}

interface DownloadExpectation { readonly bytes?: number; readonly sha256?: string }

/**
 * What this download must produce, and how big it is allowed to be.
 *
 * The catalog wins over the caller wherever it has an opinion: a tuple the app
 * pins is downloaded at the pinned size and digest whatever an argument says.
 * The limit is derived from the same lookup, so a caller cannot talk its way
 * past MAX_CACHE_FILE_BYTES by passing a large `expectedBytes` for a file no
 * catalog pins.
 */
function downloadExpectation(
  target: ProxyTarget,
  options: DownloadModelFileOptions,
): DownloadExpectation & { readonly limit: number } {
  const pinned = pinnedModelFile(target);
  const limit = cacheFileLimit(target);
  const bytes = pinned?.sizeBytes ?? options.expectedBytes;
  const sha256 = pinned?.sha256 ?? options.expectedSha256;
  if (bytes !== undefined
    && (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > limit)) {
    throw new Error(`invalid expected model size: ${bytes}`);
  }
  if (sha256 !== undefined && (!bytes || !/^[a-f0-9]{64}$/.test(sha256))) {
    throw new Error('expected model SHA-256 requires a valid size and lowercase digest');
  }
  return { bytes, sha256, limit };
}

async function reusableDownload(
  path: string,
  expected: DownloadExpectation,
  limit: number,
): Promise<boolean> {
  if (expected.sha256 && expected.bytes) {
    return fileMatchesIntegrity(path, { sizeBytes: expected.bytes, sha256: expected.sha256 });
  }
  const size = (await stat(path)).size;
  return expected.bytes !== undefined
    ? size === expected.bytes
    : size > 0 && size <= limit;
}

/**
 * Bytes of a leftover `.part` that may be continued. Only a partial shorter than
 * the expected length qualifies: an over-long or exactly-sized leftover is junk
 * from an interrupted merge, and continuing it would append to garbage.
 */
async function resumableBytes(tmpPath: string, expectedBytes: number | undefined): Promise<number> {
  if (expectedBytes === undefined) return 0;
  const size = await stat(tmpPath).then((info) => (info.isFile() ? info.size : 0)).catch(() => 0);
  return size > 0 && size < expectedBytes ? size : 0;
}

/** Download one model file into the disk cache (multi-source, verified). */
export async function downloadModelFile(
  target: ProxyTarget,
  destinationPath?: string,
  options: DownloadModelFileOptions = {},
): Promise<string> {
  const finalPath = destinationPath ?? join(modelCacheDir(), target.modelId, ...target.filePath.split('/'));
  const expected = downloadExpectation(target, options);
  const expectedBytes = expected.bytes;
  const expectedSha256 = expected.sha256;
  const limit = expected.limit;
  if (existsSync(finalPath)) {
    if (await reusableDownload(finalPath, expected, limit)) return finalPath;
    await unlink(finalPath).catch(() => undefined);
  }
  await mkdir(dirname(finalPath), { recursive: true });
  const tmpPath = `${finalPath}.part`;
  const context: CurlContext = { ...options, expectedBytes, expectedSha256, limit, progress: new Map() };
  // Only the FIRST source attempt may continue a leftover partial. Once an
  // attempt has failed the partial is discarded, so every later attempt starts
  // from zero and can never append one mirror's bytes onto another's mistake.
  let resumeFrom = options.resume ? await resumableBytes(tmpPath, expectedBytes) : 0;
  let completed = false;
  try {
    let lastError: unknown;
    for (const source of SOURCES) {
      throwIfDownloadAborted(options.signal);
      if (isSourceAbsent(target.modelId, source.name)) continue;
      try {
        if (resumeFrom === 0) await unlink(tmpPath).catch(() => undefined);
        context.progress.clear();
        await downloadFromSource(source, target, tmpPath, context, resumeFrom);
        // Verify inside the loop so a mirror drift (sha mismatch) falls
        // through to the next source instead of failing the whole download.
        const size = (await stat(tmpPath)).size;
        if (expectedBytes !== undefined ? size !== expectedBytes : size <= 0 || size > limit) {
          throw new Error(`model download produced an invalid file (${size} bytes)`);
        }
        if (expectedSha256 && expectedBytes
          && !await fileMatchesIntegrity(tmpPath, { sizeBytes: expectedBytes, sha256: expectedSha256 })) {
          throw new Error('model download failed integrity verification');
        }
        lastError = undefined;
        break;
      } catch (error) {
        if (sourceMissingOnError(error)) markSourceAbsent(target.modelId, source.name);
        lastError = error;
        // On a resumable download an abort is a pause, not a failure: leave the
        // partial where it is so the next launch can continue it. Everything
        // else — a truncated transfer, a mirror serving different bytes, a
        // digest mismatch — is thrown away, which is what keeps a resume from
        // ever building on junk.
        if (options.resume && options.signal?.aborted) throw error;
        await unlink(tmpPath).catch(() => undefined);
        resumeFrom = 0;
      }
    }
    if (lastError) throw lastError;
    const size = (await stat(tmpPath)).size;
    await rename(tmpPath, finalPath);
    completed = true;
    options.onProgress?.(size);
    return finalPath;
  } finally {
    // A paused resumable download keeps its partial; anything else cleans up
    // after itself so a half file is never mistaken for a cached one.
    const paused = completed ? false : options.resume === true && options.signal?.aborted === true;
    if (!completed && !paused) await unlink(tmpPath).catch(() => undefined);
  }
}

interface InstalledModelFile { readonly handle: FileHandle; readonly path: string; readonly size: number }

async function openInstalledCatalogFile(target: ProxyTarget): Promise<InstalledModelFile | null> {
  const expected = fixedModelFile(target);
  if (!expected) return null;
  const cacheRoot = modelCacheDir();
  const packRoot = join(cacheRoot, target.modelId);
  const candidate = join(packRoot, ...expected.path.split('/'));
  const verified = await openContainedVerifiedFile(cacheRoot, packRoot, candidate, expected);
  return verified ? { ...verified, path: candidate } : null;
}

interface ByteRange { readonly start: number; readonly end: number }

function requestedRange(value: string, size: number): ByteRange | null | false {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return false;
  let start = match[1] ? Number(match[1]) : NaN;
  let end = match[2] ? Number(match[2]) : size - 1;
  if (!match[1]) {
    const suffix = end;
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return false;
    start = Math.max(0, size - suffix);
    end = size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || start < 0 || end < start || end >= size) return false;
  return { start, end };
}

async function serveInstalledFile(
  req: IncomingMessage,
  res: ServerResponse,
  file: InstalledModelFile,
): Promise<void> {
  res.setHeader('Content-Type', contentTypeOf(file.path));
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('Accept-Ranges', 'bytes');
  const range = req.headers.range ? requestedRange(req.headers.range, file.size) : null;
  if (range === false) {
    res.setHeader('Content-Range', `bytes */${file.size}`);
    sendJson(res, 416, { error: 'range not satisfiable' });
    return;
  }
  res.statusCode = range ? 206 : 200;
  if (range) res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${file.size}`);
  res.setHeader('Content-Length', String(range ? range.end - range.start + 1 : file.size));
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = file.handle.createReadStream({
    autoClose: false,
    start: range?.start ?? 0,
    end: range?.end ?? file.size - 1,
  });
  await pipeline(stream, res);
}

export async function handleHfProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  resolveInstalled: (target: ProxyTarget) => Promise<InstalledModelFile | null> = openInstalledCatalogFile,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'method not allowed — use GET or HEAD' });
    return;
  }
  const target = parseTarget(req.url ?? '');
  if (!target) {
    sendJson(res, 400, { error: 'invalid or unavailable catalog model path' });
    return;
  }
  const file = await resolveInstalled(target);
  if (!file) {
    sendJson(res, 404, { error: 'model pack file is not installed and verified' });
    return;
  }
  try {
    await serveInstalledFile(req, res, file);
  } finally {
    await file.handle.close().catch(() => undefined);
  }
}

export function hfProxyPlugin(): Plugin {
  return {
    name: 'openchatcut-hf-proxy',
    configureServer(server) {
      server.middlewares.use('/api/hf-proxy', (req, res) => {
        void handleHfProxyRequest(req, res).catch((error) => {
          if (!res.headersSent) {
            sendJson(res, 500, { error: 'model file request failed' });
            return;
          }
          if (!res.destroyed) res.destroy(error instanceof Error ? error : undefined);
        });
      });
    },
  };
}
