import assert from 'node:assert/strict';
import type { EditorCommands } from '../../editor/store';
import type { TimelineState } from '../../editor/types';
import type { Drag } from './timelineUtil';
import { commitTimelineDragGesture } from './useTimelinePointer';

const state: TimelineState = {
  fps: 30,
  width: 1920,
  height: 1080,
  selectedId: 'clip-a',
  selectedIds: ['clip-a'],
  items: [{
    id: 'clip-a',
    track: 'video-main',
    startFrame: 100,
    durationInFrames: 50,
    name: 'Clip A',
    kind: 'video',
    srcInFrame: 12,
  }],
};

const drag: Drag = {
  id: 'clip-a',
  mode: 'move',
  baseStart: 100,
  baseDur: 50,
  baseTrack: 'video-main',
  baseSrcIn: 12,
  startX: 0,
  deltaF: 15,
  targetTrack: 'video-main',
  snapAt: null,
  alt: false,
};

const calls: Array<{ method: string; args: unknown[] }> = [];
const commands = new Proxy({}, {
  get: (_target, property) => (...args: unknown[]) => {
    calls.push({ method: String(property), args });
  },
}) as EditorCommands;

commitTimelineDragGesture(state, commands, drag, 'selection');
assert.equal(calls.length, 1, 'pointer release delegates one EditorCore commit');
assert.equal(calls[0]?.method, 'moveItem');
assert.deepEqual(calls[0]?.args, ['clip-a', { startFrame: 115, track: 'video-main' }]);

// ── Magnetic (Final Cut Pro) left trim: the start frame is ANCHORED, the in-point
// advances and the reducer ripples the followers by the end delta. No gap, ever.
calls.length = 0;
commitTimelineDragGesture(state, commands, {
  ...drag,
  mode: 'trim-left',
  deltaF: 10,
}, 'trim');
assert.deepEqual(
  calls[0]?.args,
  ['clip-a', { durationInFrames: 40, srcInFrame: 22, ripple: true }],
  '1x left trim anchors the start, advances the source in-point and ripples',
);

calls.length = 0;
const fastState: TimelineState = {
  ...state,
  items: [{ ...state.items[0]!, playbackRate: 2 }],
};
commitTimelineDragGesture(fastState, commands, {
  ...drag,
  mode: 'trim-left',
  deltaF: 10,
}, 'trim');
assert.equal(calls[0]?.method, 'setItemTiming');
assert.deepEqual(
  calls[0]?.args,
  ['clip-a', { durationInFrames: 40, srcInFrame: 32, ripple: true }],
  '2x left trim consumes twice as many source frames',
);

calls.length = 0;
const slowState: TimelineState = {
  ...state,
  items: [{ ...state.items[0]!, playbackRate: 0.5 }],
};
commitTimelineDragGesture(slowState, commands, {
  ...drag,
  mode: 'trim-left',
  deltaF: 10,
}, 'trim');
assert.deepEqual(
  calls[0]?.args,
  ['clip-a', { durationInFrames: 40, srcInFrame: 17, ripple: true }],
  '0.5x left trim consumes half as many source frames',
);

// A magnetic left extend backs the in-point up; it stops at source frame zero.
calls.length = 0;
const edgeState: TimelineState = {
  ...fastState,
  items: [{ ...fastState.items[0]!, startFrame: 1, srcInFrame: 100 }],
};
commitTimelineDragGesture(edgeState, commands, {
  ...drag,
  mode: 'trim-left',
  baseStart: 1,
  baseSrcIn: 100,
  deltaF: -100,
}, 'trim');
assert.deepEqual(
  calls[0]?.args,
  ['clip-a', { durationInFrames: 100, srcInFrame: 0, ripple: true }],
  'source-zero clamp caps the backtrack at 50 timeline frames (100 source frames @2x)',
);

// The timeline head no longer clamps a magnetic left trim: the start never moves.
for (const kind of ['image', 'gif', 'svg', 'motion-graphic', 'text', 'solid'] as const) {
  calls.length = 0;
  const extensibleState: TimelineState = {
    ...state,
    items: [{ ...state.items[0]!, kind, srcInFrame: undefined }],
  };
  commitTimelineDragGesture(extensibleState, commands, {
    ...drag,
    mode: 'trim-left',
    baseSrcIn: 0,
    deltaF: -10,
  }, 'selection');
  assert.equal(calls[0]?.method, 'setItemTiming', `${kind} left extension commits one retime`);
  assert.deepEqual(
    calls[0]?.args,
    ['clip-a', { durationInFrames: 60, ripple: true }],
    `${kind} has no source in-point, so its in-point can back up without bound`,
  );
}

// A magnetic left trim cannot collide with its predecessor — the left edge is
// anchored, so the predecessor clamp only applies to the Option escape hatch.
for (const kind of ['image', 'gif', 'svg', 'motion-graphic', 'text', 'solid'] as const) {
  calls.length = 0;
  const collidingState: TimelineState = {
    ...state,
    items: [
      { ...state.items[0]!, kind, startFrame: 120, durationInFrames: 50, srcInFrame: undefined },
      { id: 'prev', track: 'video-main', startFrame: 70, durationInFrames: 40, name: 'Prev', kind: kind as never },
    ],
  };
  const colliding: Drag = {
    ...drag,
    id: 'clip-a',
    mode: 'trim-left',
    baseStart: 120,
    baseDur: 50,
    baseSrcIn: 0,
    deltaF: -120, // attempts to extend far past the predecessor
  };
  commitTimelineDragGesture(collidingState, commands, colliding, 'selection');
  assert.deepEqual(
    calls[0]?.args,
    ['clip-a', { durationInFrames: 170, ripple: true }],
    `${kind} magnetic left extension grows to the right instead of overlapping backwards`,
  );

  calls.length = 0;
  commitTimelineDragGesture(collidingState, commands, { ...colliding, alt: true }, 'selection');
  assert.equal(calls[0]?.method, 'setItemTiming', `${kind} collision commits a clamped retime`);
  assert.deepEqual(
    calls[0]?.args,
    ['clip-a', { startFrame: 110, durationInFrames: 60 }],
    `${kind} Option left extension clamps to the predecessor right edge (70+40)`,
  );
}

// ── Right edge: magnetic in every mode, so the reducer closes/opens the gap.
for (const mode of ['selection', 'trim'] as const) {
  calls.length = 0;
  commitTimelineDragGesture(state, commands, { ...drag, mode: 'trim-right', deltaF: -20 }, mode);
  assert.equal(calls.length, 1, `${mode} right trim commits exactly one retime`);
  assert.deepEqual(
    calls[0]?.args,
    ['clip-a', { durationInFrames: 30, ripple: true }],
    `${mode} right shorten ripples the followers left`,
  );

  calls.length = 0;
  commitTimelineDragGesture(state, commands, { ...drag, mode: 'trim-right', deltaF: 20 }, mode);
  assert.deepEqual(
    calls[0]?.args,
    ['clip-a', { durationInFrames: 70, ripple: true }],
    `${mode} right extend pushes the followers right`,
  );
}

// ── Option/Alt escape hatch: the pre-magnetic behaviour, gaps included.
calls.length = 0;
commitTimelineDragGesture(state, commands, {
  ...drag, mode: 'trim-left', deltaF: 10, alt: true,
}, 'selection');
assert.deepEqual(
  calls[0]?.args,
  ['clip-a', { startFrame: 110, durationInFrames: 40, srcInFrame: 22 }],
  'Option left trim moves the start frame and never ripples',
);

calls.length = 0;
commitTimelineDragGesture(state, commands, {
  ...drag, mode: 'trim-right', deltaF: -20, alt: true,
}, 'trim');
assert.deepEqual(
  calls[0]?.args,
  ['clip-a', { durationInFrames: 30 }],
  'Option right trim leaves the gap behind it',
);

// ── Minimum duration: a trim can never take a clip below one frame.
calls.length = 0;
commitTimelineDragGesture(state, commands, { ...drag, mode: 'trim-left', deltaF: 999 }, 'selection');
assert.deepEqual(
  calls[0]?.args,
  ['clip-a', { durationInFrames: 1, srcInFrame: 61, ripple: true }],
  'left trim clamps at one remaining frame',
);

calls.length = 0;
commitTimelineDragGesture(state, commands, { ...drag, mode: 'trim-right', deltaF: -999 }, 'selection');
assert.deepEqual(
  calls[0]?.args,
  ['clip-a', { durationInFrames: 1, ripple: true }],
  'right trim clamps at one remaining frame',
);

calls.length = 0;
commitTimelineDragGesture(state, commands, {
  ...drag,
  mode: 'slip',
  deltaF: 7,
}, 'slip');
assert.equal(calls.length, 1, 'slip release commits exactly one editor operation');
assert.equal(calls[0]?.method, 'slipItem');
assert.deepEqual(calls[0]?.args, ['clip-a', 7]);

console.log('useTimelinePointer.verify: ok');
