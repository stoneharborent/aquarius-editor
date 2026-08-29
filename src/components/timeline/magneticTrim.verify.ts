// Runnable check: `npx tsx src/components/timeline/magneticTrim.verify.ts`
//
// End-to-end contract for Final Cut Pro magnetic trimming: a trim gesture goes
// through the pointer commit into the real reducer, and the timeline closes or
// opens behind the trimmed clip so dead space is never created. Holding
// Option/Alt at pointer-down is the only way back to the old, gap-leaving trim.
import assert from 'node:assert/strict';
import { reduce } from '../../editor/reduce';
import type { EditorCommands } from '../../editor/store';
import type { TimelineItem, TimelineState } from '../../editor/types';
import type { Drag, EditMode } from './timelineUtil';
import { commitTimelineDragGesture } from './useTimelinePointer';
import { trimRipplePreviewShifts } from './trimRipple';

const clip = (
  id: string,
  startFrame: number,
  durationInFrames: number,
  patch: Partial<TimelineItem> = {},
): TimelineItem => ({
  id,
  track: 'V1',
  startFrame,
  durationInFrames,
  kind: 'video',
  name: id,
  src: `/m/${id}.mp4`,
  srcInFrame: 0,
  ...patch,
} as TimelineItem);

const stateOf = (items: TimelineItem[], patch: Partial<TimelineState> = {}): TimelineState => ({
  fps: 30,
  width: 1920,
  height: 1080,
  selectedId: null,
  tracks: { V1: { kind: 'video' }, A1: { kind: 'audio' } },
  trackOrder: ['V1', 'A1'],
  items,
  ...patch,
});

const dragOf = (state: TimelineState, id: string, patch: Partial<Drag>): Drag => {
  const item = state.items.find((candidate) => candidate.id === id)!;
  return {
    id,
    mode: 'trim-right',
    baseStart: item.startFrame,
    baseDur: item.durationInFrames,
    baseTrack: item.track,
    baseSrcIn: item.srcInFrame ?? 0,
    startX: 0,
    deltaF: 0,
    targetTrack: item.track,
    snapAt: null,
    alt: false,
    ...patch,
  };
};

/** Run one pointer release against the real reducer. */
function commit(state: TimelineState, drag: Drag, editMode: EditMode = 'selection'): TimelineState {
  let next = state;
  const commands = {
    setItemTiming: (id: string, timing: Record<string, unknown>) => {
      next = reduce(next, { type: 'retime', id, ...timing } as never);
    },
    applyState: (applied: TimelineState) => { next = applied; },
    moveItem: () => { throw new Error('trim gesture must not move items'); },
    slipItem: () => { throw new Error('trim gesture must not slip items'); },
  } as unknown as EditorCommands;
  commitTimelineDragGesture(state, commands, drag, editMode);
  return next;
}

const at = (s: TimelineState, id: string) => s.items.find((item) => item.id === id)!;
const geometry = (s: TimelineState, id: string) => {
  const item = at(s, id);
  return { start: item.startFrame, dur: item.durationInFrames, srcIn: item.srcInFrame ?? 0 };
};

// ── Left edge, shorten: the start stays put, the in-point advances, followers close up ──
{
  const before = stateOf([clip('a', 0, 60), clip('b', 60, 60), clip('c', 120, 60)]);
  const drag = dragOf(before, 'b', { mode: 'trim-left', deltaF: 20 });
  const after = commit(before, drag);
  assert.deepEqual(geometry(after, 'b'), { start: 60, dur: 40, srcIn: 20 },
    'left shorten anchors the start frame and advances the source in-point');
  assert.equal(at(after, 'a').startFrame, 0, 'clips before the trim never move');
  assert.equal(at(after, 'c').startFrame, 100, 'the follower closes the gap by the trimmed amount');
  assert.deepEqual(
    [...(trimRipplePreviewShifts(before, drag, 'selection') ?? [])],
    [['c', -20]],
    'the live preview shifts exactly what the reducer shifted',
  );
}

// Playback rate ≠ 1: the in-point advances in SOURCE frames, the ripple stays in timeline frames.
{
  const before = stateOf([
    clip('a', 0, 60), clip('b', 60, 60, { playbackRate: 2, srcInFrame: 10 }), clip('c', 120, 60),
  ]);
  const after = commit(before, dragOf(before, 'b', { mode: 'trim-left', deltaF: 20 }));
  assert.deepEqual(geometry(after, 'b'), { start: 60, dur: 40, srcIn: 50 },
    '2x clip consumes 40 source frames for a 20-frame trim');
  assert.equal(at(after, 'c').startFrame, 100, 'the ripple is measured on the timeline, not the source');
}

// ── Left edge, extend: the clip grows to the right and pushes the followers ──
{
  const before = stateOf([clip('a', 0, 60), clip('b', 60, 60, { srcInFrame: 30 }), clip('c', 120, 60)]);
  const after = commit(before, dragOf(before, 'b', { mode: 'trim-left', deltaF: -20 }));
  assert.deepEqual(geometry(after, 'b'), { start: 60, dur: 80, srcIn: 10 },
    'left extend backs the in-point up and lengthens the clip');
  assert.equal(at(after, 'c').startFrame, 140, 'the follower is pushed right by the extension');
  assert.equal(at(after, 'a').startFrame, 0, 'the predecessor is untouched — the left edge never moved');
}

// Extending past source frame zero clamps instead of asking for negative source.
{
  const before = stateOf([clip('a', 0, 60), clip('b', 60, 60, { srcInFrame: 15 }), clip('c', 120, 60)]);
  const after = commit(before, dragOf(before, 'b', { mode: 'trim-left', deltaF: -400 }));
  assert.deepEqual(geometry(after, 'b'), { start: 60, dur: 75, srcIn: 0 },
    'the backtrack stops at source frame zero');
  assert.equal(at(after, 'c').startFrame, 135, 'the follower rides the clamped extension');
}

// ── Right edge: magnetic in the default selection mode, not only in Trim mode ──
for (const editMode of ['selection', 'trim'] as const) {
  const before = stateOf([clip('a', 0, 60), clip('b', 60, 60), clip('c', 120, 60)]);
  const shortened = commit(before, dragOf(before, 'b', { mode: 'trim-right', deltaF: -25 }), editMode);
  assert.equal(at(shortened, 'b').durationInFrames, 35, `${editMode}: right shorten`);
  assert.equal(at(shortened, 'c').startFrame, 95, `${editMode}: right shorten closes the gap`);

  const extended = commit(before, dragOf(before, 'b', { mode: 'trim-right', deltaF: 25 }), editMode);
  assert.equal(at(extended, 'b').durationInFrames, 85, `${editMode}: right extend`);
  assert.equal(at(extended, 'c').startFrame, 145, `${editMode}: right extend pushes the follower`);
  assert.equal(at(extended, 'a').startFrame, 0, `${editMode}: earlier clips are never touched`);
}

// ── Option/Alt escape hatch: the pre-magnetic behaviour, gap included ──
{
  const before = stateOf([clip('a', 0, 60), clip('b', 60, 60), clip('c', 120, 60)]);
  const left = commit(before, dragOf(before, 'b', { mode: 'trim-left', deltaF: 20, alt: true }));
  assert.deepEqual(geometry(left, 'b'), { start: 80, dur: 40, srcIn: 20 },
    'Option left trim moves the left edge as it always did');
  assert.equal(at(left, 'c').startFrame, 120, 'Option left trim leaves the gap in front of the clip');
  assert.equal(
    trimRipplePreviewShifts(before, dragOf(before, 'b', { mode: 'trim-left', deltaF: 20, alt: true }), 'selection'),
    null,
    'no ripple preview for an Option trim',
  );

  const right = commit(before, dragOf(before, 'b', { mode: 'trim-right', deltaF: -25, alt: true }), 'trim');
  assert.equal(at(right, 'b').durationInFrames, 35, 'Option right trim still shortens the clip');
  assert.equal(at(right, 'c').startFrame, 120, 'Option right trim leaves the gap behind the clip');
}

// ── Linked groups ripple across every track the group occupies ──
{
  const before = stateOf(
    [
      clip('v1', 0, 60), clip('v2', 60, 60),
      clip('a1', 0, 60, { track: 'A1', kind: 'audio', src: '/m/a1.wav' }),
      clip('a2', 60, 60, { track: 'A1', kind: 'audio', src: '/m/a2.wav' }),
    ],
    { linkGroups: [{ id: 'g1', itemIds: ['v1', 'a1'], anchorItemId: 'v1', mode: 'linked' }] },
  );
  const drag = dragOf(before, 'v1', { mode: 'trim-right', deltaF: -20 });
  const after = commit(before, drag);
  assert.equal(at(after, 'v1').durationInFrames, 40, 'the trimmed clip shortens');
  assert.equal(at(after, 'a1').durationInFrames, 40, 'its linked member shortens with it');
  assert.equal(at(after, 'v2').startFrame, 40, 'the video follower closes the gap');
  assert.equal(at(after, 'a2').startFrame, 40, 'the audio follower on the linked track closes it too');
  assert.deepEqual(
    [...(trimRipplePreviewShifts(before, drag, 'selection') ?? [])].toSorted(),
    [['a2', -20], ['v2', -20]],
    'the preview shifts both tracks, exactly like the reducer',
  );
}

// ── Minimum duration: a trim can never take a clip below a single frame ──
{
  const before = stateOf([clip('a', 0, 60), clip('b', 60, 60), clip('c', 120, 60)]);
  const left = commit(before, dragOf(before, 'b', { mode: 'trim-left', deltaF: 5000 }));
  assert.deepEqual(geometry(left, 'b'), { start: 60, dur: 1, srcIn: 59 }, 'left trim floors at one frame');
  assert.equal(at(left, 'c').startFrame, 61, 'the follower closes right up against the one-frame clip');

  const right = commit(before, dragOf(before, 'b', { mode: 'trim-right', deltaF: -5000 }));
  assert.equal(at(right, 'b').durationInFrames, 1, 'right trim floors at one frame');
  assert.equal(at(right, 'c').startFrame, 61, 'the follower closes right up behind it');
}

console.log('magneticTrim.verify: ok');
