// Right-click a video track → Hyperframes… → type → the clip lands there.
//
// Covers the menu entry, the floating prompt, and the wiring in Timeline.tsx that
// turns a submitted prompt into a generation carrying the clicked track + frame.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrackContextMenu } from '../components/timeline/TrackContextMenu.tsx';
import { HyperframesPromptPopup } from './HyperframesPromptPopup.tsx';
import {
  deliverHyperframeRun, drainHyperframeInbox, dropHyperframeRun, failHyperframeRun,
  hyperframesRuns, resetHyperframesRuns, startHyperframeRun,
} from './store.ts';
import { hyperframeAsset } from './records.ts';

const menuProps = {
  kind: 'video' as const,
  x: 100,
  y: 100,
  hidden: false,
  muted: false,
  locked: false,
  canTighten: false,
  hasContents: true,
  hasSelectable: true,
  deleteBlockedReason: null,
  onInsert: () => undefined,
  onTighten: () => undefined,
  onSelectAll: () => undefined,
  onClear: () => undefined,
  onToggleHidden: () => undefined,
  onToggleMuted: () => undefined,
  onToggleLocked: () => undefined,
  onRename: () => undefined,
  onOpenDuck: () => undefined,
  onOpenCaptionStyle: () => undefined,
  onOpenTranslate: () => undefined,
  onDelete: () => undefined,
  onClose: () => undefined,
};

// ── The menu entry ───────────────────────────────────────────────────────────
let opened = false;
const withHyperframes = renderToStaticMarkup(
  <TrackContextMenu {...menuProps} onHyperframes={() => { opened = true; }} />,
);
assert.match(withHyperframes, />Hyperframes…</, 'a video track offers Hyperframes in its blank-lane menu');
assert.ok(
  withHyperframes.indexOf('Hyperframes…') < withHyperframes.indexOf('Close gaps'),
  'it sits with the other "put something here" actions, right after Insert assets',
);

const withoutHyperframes = renderToStaticMarkup(<TrackContextMenu {...menuProps} />);
assert.doesNotMatch(
  withoutHyperframes,
  /Hyperframes/,
  'tracks that cannot hold a graphic (and hosts without the provider) must not offer it',
);

/** The one <button> whose label is `label`, isolated from the surrounding menu. */
function menuButton(markup: string, label: string): string {
  const button = markup
    .split('<button')
    .find((chunk) => chunk.includes(`>${label}<`));
  assert.ok(button, `no menu item labelled "${label}"`);
  return button;
}

const lockedMenu = renderToStaticMarkup(
  <TrackContextMenu {...menuProps} locked onHyperframes={() => undefined} />,
);
assert.match(
  menuButton(lockedMenu, 'Hyperframes…'),
  /disabled=""/,
  'a locked track cannot receive a generated clip',
);
assert.doesNotMatch(
  menuButton(withHyperframes, 'Hyperframes…'),
  /disabled=""/,
  'an unlocked video track can',
);

assert.equal(opened, false, 'nothing fires from rendering alone — the item waits for a click');

// ── The floating prompt ──────────────────────────────────────────────────────
let submitted: string | null = null;
let closed = false;
const popup = renderToStaticMarkup(
  <HyperframesPromptPopup
    x={220}
    y={340}
    atLabel="V1 · 00:04.00"
    configured
    onSubmit={(value) => { submitted = value; }}
    onClose={() => { closed = true; }}
    onConfigured={() => undefined}
  />,
);
assert.match(popup, /role="dialog"/, 'the prompt is a dialog anchored at the click point');
assert.match(popup, /placeholder="Describe the graphic you want…"/);
assert.match(popup, /Press Enter to generate/, 'Enter is the documented way to submit');
assert.match(popup, /V1 · 00:04\.00/, 'the notice names the exact spot the clip will fill');
assert.match(popup, /Hyperframes tab/, 'and says the result is also saved to the Library tab');
assert.equal(submitted, null);
assert.equal(closed, false);

const unconfiguredPopup = renderToStaticMarkup(
  <HyperframesPromptPopup
    x={220}
    y={340}
    atLabel="V1 · 00:04.00"
    configured={false}
    onSubmit={() => undefined}
    onClose={() => undefined}
    onConfigured={() => undefined}
  />,
);
assert.match(
  unconfiguredPopup,
  /Connect a model to generate graphics/,
  'attempting to generate with no model configured shows the same inline setup card',
);
assert.doesNotMatch(unconfiguredPopup, /Press Enter to generate/,
  'and does not offer a prompt that could not go anywhere');

// ── Timeline wiring ──────────────────────────────────────────────────────────
const timelineSource = await readFile(
  new URL('../components/timeline/Timeline.tsx', import.meta.url),
  'utf8',
);
assert.match(
  timelineSource,
  /hyperframes && kind === 'video' \? \{[\s\S]*?onHyperframes:/,
  'the menu item is offered only for video-capable tracks',
);
assert.match(
  timelineSource,
  /setHyperframesPrompt\(\{\s*trackId, frame: trackMenu\.frame, x: trackMenu\.x, y: trackMenu\.y,/,
  'the prompt opens at the click point and remembers the clicked frame',
);
assert.match(
  timelineSource,
  /hyperframes\.generate\(prompt, \{\s*track: hyperframesPrompt\.trackId,\s*startFrame: hyperframesPrompt\.frame,/,
  'submitting generates for that exact track and frame, not the playhead',
);
assert.match(
  timelineSource,
  /showAppToast\(t\('Generating a graphic — it drops in when it is ready\.'\)\)/,
  'the popup closes with a notice so the wait is visible',
);

// ── Runs survive the editor being left, and land when it comes back ──────────
resetHyperframesRuns();
const PROJECT = 'project-1';
startHyperframeRun(PROJECT, {
  id: 'run-1',
  prompt: 'a neon title card',
  createdAt: 1,
  status: 'running',
  placement: { track: 'V1', startFrame: 120 },
});
assert.equal(hyperframesRuns(PROJECT).pending.length, 1, 'the run is visible while it works');
assert.equal(hyperframesRuns('other-project').pending.length, 0, 'runs are per project');

const asset = hyperframeAsset({
  id: 'hf-1', prompt: 'a neon title card', code: 'const A = ({ item }) => <AbsoluteFill />;',
  width: 1920, height: 1080, durationInFrames: 150, createdAt: 1,
});
deliverHyperframeRun(PROJECT, {
  runId: 'run-1',
  asset,
  placement: { track: 'V1', startFrame: 120, timelineId: 'timeline-1' },
});
assert.equal(hyperframesRuns(PROJECT).pending.length, 1,
  'the pending card stays up until the result is actually committed');

const drained = drainHyperframeInbox(PROJECT);
assert.equal(drained.length, 1, 'a finished generation waits in the inbox for an editor to commit it');
assert.equal(drained[0]!.asset.id, 'hf-1');
assert.deepEqual(drained[0]!.placement, { track: 'V1', startFrame: 120, timelineId: 'timeline-1' },
  'placement carries the timeline it was meant for, so a stale drop is impossible');
assert.equal(hyperframesRuns(PROJECT).pending.length, 0, 'and the pending card clears on commit');
assert.deepEqual(drainHyperframeInbox(PROJECT), [], 'a delivery is only handed out once');

// A failure keeps its card, with a reason and a way to drop it.
startHyperframeRun(PROJECT, { id: 'run-2', prompt: 'broken', createdAt: 2, status: 'running' });
failHyperframeRun(PROJECT, 'run-2', 'Provider rate limited');
assert.equal(hyperframesRuns(PROJECT).pending[0]!.status, 'failed');
assert.equal(hyperframesRuns(PROJECT).pending[0]!.error, 'Provider rate limited');
dropHyperframeRun(PROJECT, 'run-2');
assert.equal(hyperframesRuns(PROJECT).pending.length, 0);
resetHyperframesRuns();

console.log('hyperframes-timeline.verify: menu entry, anchored prompt, insert-at-frame dispatch and run recovery OK');
