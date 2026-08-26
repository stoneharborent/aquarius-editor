import assert from 'node:assert/strict';
import { resolveUpstreamUpdateAction } from './upstreamUpdateAction';
import {
  RELEASE_FEED,
  UPDATE_CHECKS_ENABLED,
  formatDisplayVersion,
  hasDesktopUpdateSupport,
  mapDesktopUpdateState,
  queryLatestUpstreamRelease,
  requestUpstreamUpdateCheck,
  getUpstreamUpdateState,
} from './upstreamUpdate';

assert.equal(formatDisplayVersion('0.1.7'), 'V0.1.7');
assert.equal(formatDisplayVersion('v0.1.7'), 'V0.1.7');

// The fork must never inherit upstream's feed: Aquarius Editor has no release feed of its own,
// so an update check makes no network request and never claims a new version exists.
assert.equal(RELEASE_FEED, null, 'Aquarius Editor must not point at another project\'s releases');
assert.equal(UPDATE_CHECKS_ENABLED, false);
assert.equal(hasDesktopUpdateSupport(), false, 'no feed means no desktop update path');
let feedFetches = 0;
const guardedFetch = globalThis.fetch;
globalThis.fetch = (async () => { feedFetches += 1; return new Response('{}'); }) as typeof fetch;
await requestUpstreamUpdateCheck('manual');
globalThis.fetch = guardedFetch;
assert.equal(feedFetches, 0, 'an update check must not contact any server while no feed is configured');
assert.deepEqual(getUpstreamUpdateState(), { phase: 'idle', visible: false });
await assert.rejects(
  queryLatestUpstreamRelease('0.1.7', async () => new Response('{}')),
  /No release feed is configured/,
  'the release query must refuse to run without an explicit feed URL',
);

// The comparison logic below stays exercised against an explicit feed URL, so it is ready
// the day Aquarius Editor gets a release feed of its own.
const FEED_URL = 'https://api.github.com/repos/stoneharborent/aquarius-editor/releases/latest';

const samples = [
  { current: '0.1.7', tag: 'v0.1.7', available: false },
  { current: '0.1.7', tag: 'v0.1.8', available: true },
  { current: '0.2.0', tag: 'v0.1.9', available: false },
  { current: '0.1.8-beta.1', tag: 'v0.1.8', available: true },
] as const;

for (const sample of samples) {
  let requestedUrl = '';
  const result = await queryLatestUpstreamRelease(sample.current, async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ tag_name: sample.tag }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }, undefined, FEED_URL);
  assert.equal(requestedUrl, FEED_URL);
  assert.equal(result.latestVersion, sample.tag);
  assert.equal(result.updateAvailable, sample.available, `${sample.current} compared with ${sample.tag}`);
}

await assert.rejects(
  queryLatestUpstreamRelease('0.1.7', async () => new Response('{}', { status: 200 }), undefined, FEED_URL),
  /valid release version/i,
  'missing tag_name should fail instead of reporting a false update',
);

const availableState = mapDesktopUpdateState({
  phase: 'available',
  currentVersion: '0.1.9',
  latestVersion: '0.2.0',
  source: 'manual',
});
assert.deepEqual(availableState, {
  phase: 'available',
  visible: true,
  currentVersion: '0.1.9',
  latestVersion: '0.2.0',
  source: 'manual',
});
assert.equal(resolveUpstreamUpdateAction(availableState, true).command, 'download');
assert.equal(resolveUpstreamUpdateAction(availableState, false).command, 'view-release');

const downloadingState = mapDesktopUpdateState({
  phase: 'downloading',
  currentVersion: '0.1.9',
  latestVersion: '0.2.0',
  source: 'manual',
  percent: 142,
});
assert.equal(downloadingState.phase, 'downloading');
assert.equal(downloadingState.phase === 'downloading' ? downloadingState.percent : -1, 100);
assert.equal(resolveUpstreamUpdateAction(downloadingState, true).disabled, true);

const failedInstallState = mapDesktopUpdateState({
  phase: 'error',
  currentVersion: '0.1.9',
  latestVersion: '0.2.0',
  source: 'manual',
  failedOperation: 'install',
});
assert.equal(failedInstallState.phase, 'error');
assert.equal(resolveUpstreamUpdateAction(failedInstallState, true).command, 'install');

assert.deepEqual(mapDesktopUpdateState({
  phase: 'unsupported',
  currentVersion: '0.1.9',
  source: 'auto',
}), { phase: 'idle', visible: false });

console.log('upstreamUpdate.verify: official release comparison passed');
