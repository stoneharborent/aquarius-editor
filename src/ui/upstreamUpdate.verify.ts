import assert from 'node:assert/strict';
import {
  resolveUpstreamUpdateAction,
  resolveUpstreamUpdateFallbackAction,
  upstreamUpdateMessage,
} from './upstreamUpdateAction';
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

// The fork must never inherit upstream's feed. It reads its own repository's releases and
// nothing else: OpenChatCut is a different app on a different version line, and offering its
// releases here would install the wrong program.
const FEED_URL = 'https://api.github.com/repos/stoneharborent/aquarius-editor/releases/latest';
assert.equal(UPDATE_CHECKS_ENABLED, true, 'Aquarius Editor publishes releases, so update checks are live');
assert.equal(RELEASE_FEED?.latestReleaseApiUrl, FEED_URL);
assert.equal(RELEASE_FEED?.releasesPageUrl, 'https://github.com/stoneharborent/aquarius-editor/releases/latest');
for (const url of [RELEASE_FEED?.latestReleaseApiUrl, RELEASE_FEED?.releasesPageUrl]) {
  assert.doesNotMatch(String(url), /openchatcut/i, 'the fork must not point at another project\'s releases');
  assert.match(String(url), /^https:\/\//, 'release metadata must not travel in the clear');
}

// A browser tab has no Electron bridge, so it can only ever link out to the releases page.
assert.equal(hasDesktopUpdateSupport(), false, 'the web build has no in-place update path');
const guardedFetch = globalThis.fetch;
let checkedUrl = '';
globalThis.fetch = (async (input: string | URL | Request) => {
  checkedUrl = String(input);
  // Outside Vite there is no __APP_VERSION__ define, so the build reports itself as 0.0.0.
  return new Response(JSON.stringify({ tag_name: 'v0.0.0' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}) as typeof fetch;
await requestUpstreamUpdateCheck('manual');
globalThis.fetch = guardedFetch;
assert.equal(checkedUrl, FEED_URL, 'the check must go to the fork\'s own release feed');
assert.equal(getUpstreamUpdateState().phase, 'current', 'the published tag matching this build is not an update');

await assert.rejects(
  queryLatestUpstreamRelease('0.1.7', async () => new Response('{}'), undefined, ''),
  /No release feed is configured/,
  'the release query must refuse to guess a feed URL',
);

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

// --- a failed check must explain itself and offer a way out --------------------------------
// "Unable to check for updates. Please try again later." was all v0.6.0 said while its
// AquariusOS build was permanently unable to check, and the only button retried the same
// broken call. Every failure now names a reason and keeps a route to the releases page.
for (const reason of ['offline', 'rate-limited', 'unavailable', 'unreadable', 'unknown'] as const) {
  const failed = mapDesktopUpdateState({
    phase: 'error',
    currentVersion: '0.6.0',
    source: 'manual',
    failedOperation: 'check',
    failureReason: reason,
  });
  assert.equal(failed.phase === 'error' ? failed.failureReason : null, reason);
  const message = upstreamUpdateMessage(failed, true);
  assert.notEqual(
    message,
    'Unable to check for updates. Please try again later.',
    `a ${reason} failure must say more than the old catch-all`,
  );
  assert.match(message, /releases page|internet connection/i, `a ${reason} failure must point somewhere`);
  assert.equal(resolveUpstreamUpdateAction(failed, true).command, 'check', 'a failed check stays retryable');
  assert.equal(
    resolveUpstreamUpdateFallbackAction(failed)?.command,
    'view-release',
    'a failed check must always offer the releases page as well',
  );
}
assert.match(
  upstreamUpdateMessage(mapDesktopUpdateState({
    phase: 'error', currentVersion: '0.6.0', source: 'manual', failedOperation: 'check', failureReason: 'offline',
  }), true),
  /internet connection/i,
  'an unreachable server must mention the connection, since that is what the user can act on',
);
assert.match(
  upstreamUpdateMessage(mapDesktopUpdateState({
    phase: 'error', currentVersion: '0.6.0', source: 'manual', failedOperation: 'check', failureReason: 'rate-limited',
  }), true),
  /rate-limit/i,
  'a rate-limited check must say waiting is the answer, not retrying now',
);
// A state that is not a failure has nothing to escape from.
assert.equal(resolveUpstreamUpdateFallbackAction(availableState), null);
assert.equal(resolveUpstreamUpdateFallbackAction({ phase: 'idle', visible: false }), null);

// A missing reason from an older main process must not crash the renderer.
const legacyFailure = mapDesktopUpdateState({
  phase: 'error', currentVersion: '0.6.0', source: 'manual', failedOperation: 'check',
});
assert.equal(legacyFailure.phase === 'error' ? legacyFailure.failureReason : null, 'unknown');

assert.deepEqual(mapDesktopUpdateState({
  phase: 'unsupported',
  currentVersion: '0.1.9',
  source: 'auto',
}), { phase: 'idle', visible: false });

console.log('upstreamUpdate.verify: official release comparison passed');
