// Runnable check: `npx tsx src/editor/historyGesture.verify.ts`.
// Continuous gestures (drag the slider, drag the color picker) must leave only one undo record: undo must go back to
// "before dragging" instead of the previous tick. Without this, volume 0->2 would push about 40 snapshots at 0.05
// steps, and with a cap of only 100 — two drags would squeeze out the user's real editing history.
import assert from 'node:assert/strict';
import { historyReduce, type History } from './reduce';
import type { ProjectDoc, TimelineItem } from './types';

const item = (volume: number): TimelineItem => ({
  id: 'a', track: 'A1', startFrame: 0, durationInFrames: 60,
  kind: 'audio', name: 'a', src: '/m/a.wav', volume,
} as TimelineItem);

const docOf = (volume: number): ProjectDoc => ({
  version: 3, assets: [], mediaFolders: [], activeTimelineId: 'tl1',
  timelines: [{
    id: 'tl1', name: 'main', order: 0, fps: 30, width: 1920, height: 1080, selectedId: null,
    tracks: { A1: { kind: 'audio' } }, trackOrder: ['A1'], items: [item(volume)],
  }],
} as unknown as ProjectDoc);

const start = (): History => ({ past: [], present: docOf(1), future: [] });
const volumeOf = (h: History) => h.present.timelines[0]!.items[0]!.volume;
const setVolume = (h: History, volume: number) => historyReduce(h, { type: 'setVolume', id: 'a', volume });

// ── Gestures disabled: each step is its own history entry (original behavior, a single keyboard adjustment stays the same) ──
{
  let h = start();
  for (const v of [1.1, 1.2, 1.3]) h = setVolume(h, v);
  assert.equal(h.past.length, 3, 'each step is recorded when there is no gesture boundary');
}

// ── Gestures enabled: only one of the 40 steps is kept, and undo returns to before dragging ──
{
  let h = start();
  h = historyReduce(h, { type: 'history.beginGesture' });
  assert.equal(h.past.length, 0, 'beginning a gesture must not touch history by itself');
  for (let i = 1; i <= 40; i += 1) h = setVolume(h, Math.round((1 + i * 0.025) * 1000) / 1000);
  h = historyReduce(h, { type: 'history.endGesture' });

  assert.equal(h.past.length, 1, `40 steps should leave only 1 history entry, got ${h.past.length}`);
  assert.equal(volumeOf(h), 2, 'the current value is the final dragged value');
  const undone = historyReduce(h, { type: 'undo' });
  assert.equal(volumeOf(undone), 1, 'undo goes back to before the drag, not the previous tick');
  assert.equal(undone.past.length, 0);
}

// ── Two independent gestures = two history entries, not merged across gestures ──
{
  let h = start();
  for (const [a, b] of [[1.5, 1.8], [0.5, 0.2]] as const) {
    h = historyReduce(h, { type: 'history.beginGesture' });
    h = setVolume(h, a);
    h = setVolume(h, b);
    h = historyReduce(h, { type: 'history.endGesture' });
  }
  assert.equal(h.past.length, 2, 'each gesture leaves one entry');
  assert.equal(volumeOf(h), 0.2);
  assert.equal(volumeOf(historyReduce(h, { type: 'undo' })), 1.8, 'undo goes back to before the second gesture');
}

// ── No change during the gesture: no extra history entry should be conjured out of thin air ──
{
  let h = start();
  h = historyReduce(h, { type: 'history.beginGesture' });
  h = historyReduce(h, { type: 'history.endGesture' });
  assert.equal(h.past.length, 0);
  assert.equal(h.gesture, undefined, 'gesture state is cleared after it ends');
}

// ── The redo branch is still cleared during a gesture (same as normal editing) ──
{
  let h = start();
  h = setVolume(h, 1.5);
  h = historyReduce(h, { type: 'undo' });
  assert.equal(h.future.length, 1, 'there is a redoable branch');
  h = historyReduce(h, { type: 'history.beginGesture' });
  h = setVolume(h, 0.8);
  h = setVolume(h, 0.6);
  assert.equal(h.future.length, 0, 'new edits clear the redo branch');
  assert.equal(h.past.length, 1);
}

// ── undo/redo turns off gesture state so it can't get stuck after undoing a drag ──
{
  let h = start();
  h = historyReduce(h, { type: 'history.beginGesture' });
  h = setVolume(h, 1.4);
  assert.equal(h.gesture, 'pushed');
  h = historyReduce(h, { type: 'undo' });
  assert.equal(h.gesture, undefined, 'gesture state is cleared after undo');
  h = setVolume(h, 1.9);
  assert.equal(h.past.length, 1, 'subsequent edits are recorded as usual');
}

// ── Repeating begin does not reopen the gesture ──
{
  let h = start();
  h = historyReduce(h, { type: 'history.beginGesture' });
  h = setVolume(h, 1.2);
  h = historyReduce(h, { type: 'history.beginGesture' });
  h = setVolume(h, 1.4);
  assert.equal(h.past.length, 1, 'still only one entry');
}

console.log('historyGesture.verify: ok (step-by-step / 40-steps-merge / gestures-not-merged-across / empty-gesture / redo-cleared / undo-finalizes / repeated-begin)');
