// The AquariusOS overlay installer, driven end to end against real temp directories with
// the network and the AppImage self-extraction stubbed out. What must hold:
//   - env gating: nothing activates unless the launcher says so
//   - a checksum mismatch refuses the update and leaves `current` alone
//   - the `current` symlink swap is atomic and relative
//   - old versions are reclaimed, and the live one never is
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readlink, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_OVERLAY_DIR,
  installOverlayUpdate,
  isOsManagedInstall,
  normalizeOverlayVersion,
  overlayAppImageAssetName,
  overlayReleaseAssets,
  parseSha256Sums,
  pruneOverlayVersions,
  readOverlayCurrentVersion,
  resolveOverlayRoot,
  swapOverlayCurrent,
  type OverlayUpdateIo,
} from './overlay-update';

// --- env gating ---------------------------------------------------------------------------
assert.equal(isOsManagedInstall({}), false);
assert.equal(isOsManagedInstall({ AQUARIUS_OS_MANAGED_INSTALL: '0' }), false);
assert.equal(isOsManagedInstall({ AQUARIUS_OS_MANAGED_INSTALL: 'true' }), false, 'only the exact flag counts');
assert.equal(isOsManagedInstall({ AQUARIUS_OS_MANAGED_INSTALL: '1' }), true);

assert.equal(
  resolveOverlayRoot({ HOME: '/home/royce', AQUARIUS_UPDATE_OVERLAY_DIR: '/opt/overlay' }),
  null,
  'an ordinary build must never write an overlay, whatever the directory says',
);
assert.equal(
  resolveOverlayRoot({ AQUARIUS_OS_MANAGED_INSTALL: '1', AQUARIUS_UPDATE_OVERLAY_DIR: '/opt/overlay' }),
  '/opt/overlay',
  'the launcher chooses the overlay root',
);
assert.equal(
  resolveOverlayRoot({ AQUARIUS_OS_MANAGED_INSTALL: '1', HOME: '/home/royce' }),
  join('/home/royce', DEFAULT_OVERLAY_DIR),
  'a missing directory falls back to the documented default',
);
assert.equal(
  resolveOverlayRoot({ AQUARIUS_OS_MANAGED_INSTALL: '1', HOME: '/home/royce', AQUARIUS_UPDATE_OVERLAY_DIR: 'overlay' }),
  join('/home/royce', DEFAULT_OVERLAY_DIR),
  'a relative overlay directory is a mistake, not a path to resolve against the working directory',
);
assert.equal(
  resolveOverlayRoot({ AQUARIUS_OS_MANAGED_INSTALL: '1' }),
  null,
  'with neither a directory nor a home there is nowhere safe to install',
);

// --- release asset naming ------------------------------------------------------------------
assert.equal(normalizeOverlayVersion('v0.4.1'), '0.4.1', 'feed versions may carry the tag prefix');
assert.equal(normalizeOverlayVersion('0.4.1-beta.2'), '0.4.1-beta.2');
for (const hostile of ['../../etc', '0.4.1/../../etc', '', 'latest', '0.4']) {
  assert.throws(
    () => normalizeOverlayVersion(hostile),
    /Unusable release version/,
    `${hostile || '(empty)'} must never become a directory name`,
  );
}
assert.equal(overlayAppImageAssetName('v0.4.1'), 'AquariusEditor-0.4.1-x86_64.AppImage');
assert.match(overlayReleaseAssets('0.4.1').appImageUrl, /\/releases\/download\/v0\.4\.1\//);

// --- checksum manifest parsing --------------------------------------------------------------
const digest = 'a'.repeat(64);
const otherDigest = 'b'.repeat(64);
const manifest = [
  `${digest}  ./AquariusEditor-0.4.1-x86_64.AppImage`,
  `${otherDigest} *AquariusEditor-0.4.1-x64.exe`,
  'not a checksum line',
  '',
].join('\n');
const parsed = parseSha256Sums(manifest);
assert.equal(parsed.get('AquariusEditor-0.4.1-x86_64.AppImage'), digest, 'sha256sum ./* prefixes names with ./');
assert.equal(parsed.get('AquariusEditor-0.4.1-x64.exe'), otherDigest, 'binary-mode names are prefixed with *');
assert.equal(parsed.size, 2, 'junk lines are ignored, never guessed at');

// --- filesystem harness ---------------------------------------------------------------------
const root = await mkdtemp(join(tmpdir(), 'aquarius-overlay-'));

interface Stub {
  readonly io: OverlayUpdateIo;
  readonly calls: { extracts: number; downloads: number };
}

function stubIo(options: { payload: string; manifestDigest?: string; contents?: string }): Stub {
  const calls = { extracts: 0, downloads: 0 };
  const hash = `${'c'.repeat(63)}1`;
  return {
    calls,
    io: {
      downloadFile: async (_url, destination, onProgress) => {
        calls.downloads += 1;
        onProgress(50);
        await writeFile(destination, options.payload);
        onProgress(100);
      },
      fetchText: async (url) => {
        const tag = url.match(/\/download\/v([^/]+)\//)?.[1];
        assert.ok(tag, `the checksum URL must name the release tag: ${url}`);
        return `${options.manifestDigest ?? hash}  ./${overlayAppImageAssetName(tag)}\n`;
      },
      hashFile: async () => hash,
      extractAppImage: async (_appImagePath, workDir) => {
        calls.extracts += 1;
        const extracted = join(workDir, 'squashfs-root');
        await mkdir(join(extracted, 'resources'), { recursive: true });
        await writeFile(join(extracted, 'AppRun'), options.contents ?? 'app');
      },
    },
  };
}

// A successful install: download → verify → extract → swap.
const overlayRoot = join(root, 'overlay');
const progress: number[] = [];
let extractStarted = false;
const first = stubIo({ payload: 'appimage-0.4.1', contents: '0.4.1' });
const installed = await installOverlayUpdate(overlayRoot, 'v0.4.1', {
  onProgress: (percent) => { progress.push(percent); },
  onExtractStart: () => { extractStarted = true; },
}, first.io);

assert.equal(installed, join(overlayRoot, 'versions', '0.4.1'), 'the tag prefix is stripped from the directory name');
assert.deepEqual(progress, [50, 100], 'the HTTP transfer drives the progress the UI shows');
assert.equal(extractStarted, true, 'the slow extract/swap is announced so the UI can leave the download phase');
assert.equal(first.calls.extracts, 1);
assert.ok((await stat(join(installed, 'AppRun'))).isFile(), 'the extracted tree is what lands in versions/');
assert.equal(
  await readlink(join(overlayRoot, 'current')),
  join('versions', '0.4.1'),
  'current is a relative symlink so the overlay stays movable',
);
assert.deepEqual(
  await readdir(join(overlayRoot, 'tmp')),
  [],
  'the work directory and the downloaded AppImage are cleaned up after a success',
);

// A tampered or truncated download is refused, and the live install is untouched.
const tampered = stubIo({ payload: 'not-the-release', manifestDigest: 'd'.repeat(64) });
await assert.rejects(
  installOverlayUpdate(overlayRoot, '0.4.2', {}, tampered.io),
  /failed its SHA-256 check/,
  'a checksum mismatch must refuse the update',
);
assert.equal(tampered.calls.extracts, 0, 'nothing unverified is ever executed');
assert.equal(await readOverlayCurrentVersion(overlayRoot), '0.4.1', 'a refused update leaves current alone');
assert.deepEqual(await readdir(join(overlayRoot, 'versions')), ['0.4.1'], 'no partial version directory survives');
assert.deepEqual(await readdir(join(overlayRoot, 'tmp')), [], 'the failed attempt cleans up after itself');

// An asset missing from the manifest is refused too — an unlisted file is not a verified one.
const unlisted: OverlayUpdateIo = {
  ...stubIo({ payload: 'x' }).io,
  fetchText: async () => `${'e'.repeat(64)}  ./SomethingElse.AppImage\n`,
};
await assert.rejects(
  installOverlayUpdate(overlayRoot, '0.4.2', {}, unlisted),
  /is not listed in SHA256SUMS\.txt/,
);
assert.equal(await readOverlayCurrentVersion(overlayRoot), '0.4.1');

// A second successful install swaps the symlink and reclaims the ~2 GB the old copy held.
const second = stubIo({ payload: 'appimage-0.4.2', contents: '0.4.2' });
await installOverlayUpdate(overlayRoot, '0.4.2', {}, second.io);
assert.equal(await readOverlayCurrentVersion(overlayRoot), '0.4.2');
assert.deepEqual(
  await readdir(join(overlayRoot, 'versions')),
  ['0.4.2'],
  'the superseded version is deleted so the disk does not fill up',
);

// Pruning never removes what is running, even when asked to keep something else.
await mkdir(join(overlayRoot, 'versions', '0.3.9'), { recursive: true });
await mkdir(join(overlayRoot, 'versions', '0.4.3'), { recursive: true });
const removed = await pruneOverlayVersions(overlayRoot, '0.4.3');
assert.deepEqual(removed, ['0.3.9'], 'only versions that are neither current nor newly installed go');
assert.deepEqual((await readdir(join(overlayRoot, 'versions'))).sort(), ['0.4.2', '0.4.3']);

// The swap replaces whatever `current` was, including a stray directory left by hand.
const legacyRoot = join(root, 'legacy');
await mkdir(join(legacyRoot, 'versions', '1.0.0'), { recursive: true });
await mkdir(join(legacyRoot, 'current'), { recursive: true });
await swapOverlayCurrent(legacyRoot, '1.0.0');
assert.equal(await readOverlayCurrentVersion(legacyRoot), '1.0.0');
assert.deepEqual(
  (await readdir(legacyRoot)).sort(),
  ['current', 'versions'],
  'the staged symlink is renamed into place, never left behind',
);

await rm(root, { recursive: true, force: true });

console.log('overlay-update.verify: env gating, checksum refusal, atomic swap, and version reclaim OK');
