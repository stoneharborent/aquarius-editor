// Aquarius Cut has no release feed (see RELEASE_FEED in ./upstreamUpdate.ts), so this file
// checks the *containment*: even with a desktop update bridge attached and a server that
// would happily report a newer version, the app makes no request and offers no update.
//
// Upstream's version of this file exercised the auto-check race guard and the web fallback.
// Those code paths still exist behind the feed switch; restore this test from git history
// (commit "rebrand: Aquarius Cut identity, icons, and update feed") when a feed is configured.
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import type { DesktopUpdateState } from '../../shared/desktop-update';

const calls: string[] = [];
const available: DesktopUpdateState = {
  phase: 'available',
  source: 'manual',
  currentVersion: '0.1.9',
  latestVersion: '0.2.0',
};
const updates = {
  getState: async () => { calls.push('getState'); return available; },
  check: async () => { calls.push('check'); return available; },
  download: async () => { calls.push('download'); return available; },
  install: async () => { calls.push('install'); return available; },
  subscribe: (_listener: (state: DesktopUpdateState) => void) => {
    calls.push('subscribe');
    return () => {};
  },
};

let fetches = 0;
Object.defineProperties(globalThis, {
  fetch: {
    configurable: true,
    value: async () => {
      fetches += 1;
      return new Response(JSON.stringify({ tag_name: 'v9.9.9' }), { status: 200 });
    },
  },
  window: {
    configurable: true,
    value: { openChatCutDesktop: { updates }, open: () => { calls.push('open'); } },
  },
});

// Runtime import is intentional: the desktop bridge must exist before this stateful module is evaluated.
const moduleUrl = new URL('./upstreamUpdate.ts', import.meta.url);
const updateModule = await import(moduleUrl.href);

assert.equal(updateModule.UPDATE_CHECKS_ENABLED, false);
assert.equal(updateModule.hasDesktopUpdateSupport(), false, 'a bridge without a feed is not update support');

updateModule.startAutomaticUpstreamUpdateCheck();
await delay(5);
assert.equal(updateModule.getUpstreamUpdateState().phase, 'idle', 'startup must not begin an update check');

updateModule.subscribeUpstreamUpdate(() => {});
await updateModule.requestUpstreamUpdateCheck('manual');
await updateModule.requestUpstreamUpdateDownload();
await updateModule.requestUpstreamUpdateInstall();
updateModule.openUpstreamReleasePage();
await delay(5);

assert.deepEqual(updateModule.getUpstreamUpdateState(), { phase: 'idle', visible: false });
assert.deepEqual(calls, [], 'the Electron updater bridge must never be invoked without a feed');
assert.equal(fetches, 0, 'no update request may leave the machine without a feed');

const actionModule = await import('./upstreamUpdateAction.ts');
const action = actionModule.resolveUpstreamUpdateAction(updateModule.getUpstreamUpdateState(), false);
assert.equal(action.command, 'check', 'the idle action stays a check; the settings header hides it while updates are off');

console.log('upstreamUpdateDesktop.verify: no release feed means no update traffic and no update offer');
