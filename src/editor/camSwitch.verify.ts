// Runnable check: `npx tsx src/editor/camSwitch.verify.ts`.
// Verification: geometric results of the change_cam planner through the real reducer
// (middle double-cut / edge single-cut / whole-segment deletion / non-intersecting
// zero action), srcInFrame advancing forward, no ripple (other tracks don't move),
// coverage gap calculation, and the tool layer's execChangeCam boundary checks,
// multi-segment targets from the same source, and single-batch submission.
import assert from 'node:assert/strict';
import { coveredFrames, planCamSwitch } from './camSwitch';
import { reduce, type Action, type AtomicAction } from './reduce';
import type { TimelineItem, TimelineState } from './types';
import { execChangeCam } from '../agent/tools/multicam-tools';

let seq = 0;
const makeId = (): string => `seg_${++seq}`;
const clip = (id: string, track: string, startFrame: number, dur: number, src: string, patch: Partial<TimelineItem> = {}): TimelineItem =>
  ({ id, track, startFrame, durationInFrames: dur, kind: 'video', name: id, src, ...patch } as TimelineItem);

const baseState = (): TimelineState => ({
  fps: 30, width: 1920, height: 1080, selectedId: null,
  tracks: { V1: { kind: 'video' }, V2: { kind: 'video' }, V3: { kind: 'video' }, A1: { kind: 'audio' } },
  trackOrder: ['V1', 'V2', 'V3', 'A1'],
  items: [
    clip('camA', 'V1', 0, 300, '/m/a.mp4'),
    clip('camB', 'V2', 0, 300, '/m/b.mp4', { keyframes: { opacity: [{ frame: 0, value: 1 }, { frame: 299, value: 0.2 }] } }),
    clip('camC', 'V3', 0, 300, '/m/c.mp4'),
    { id: 'mix', track: 'A1', startFrame: 0, durationInFrames: 300, kind: 'audio', name: 'mix', src: '/m/mix.wav' } as TimelineItem,
  ],
});

const applyPlan = (s: TimelineState, actions: Action[]): TimelineState => actions.reduce(reduce, s);
const spansOf = (s: TimelineState, src: string) => s.items
  .filter((it) => it.src === src)
  .map((it) => [it.startFrame, it.startFrame + it.durationInFrames])
  .sort((a, b) => a[0] - b[0]);

// ── 1. The interval is in the middle: other camera angles get a double cut and delete, leaving [0,60)+[150,300); srcIn advances by 150 ──
{
  const s0 = baseState();
  const plan = planCamSwitch([s0.items[0]], [s0.items[1], s0.items[2]], 60, 150, makeId);
  assert.equal(plan.actions.length, 6, 'two camera angles, each 2 cuts + 1 delete');
  assert.equal(plan.coverageGapFrames, 0, 'target fully covers, no gap');
  const s1 = applyPlan(s0, plan.actions);
  assert.deepEqual(spansOf(s1, '/m/b.mp4'), [[0, 60], [150, 300]], 'camB left with two segments');
  assert.deepEqual(spansOf(s1, '/m/c.mp4'), [[0, 60], [150, 300]], 'camC left with two segments');
  assert.deepEqual(spansOf(s1, '/m/a.mp4'), [[0, 300]], 'target camera angle untouched');
  const bTail = s1.items.find((it) => it.src === '/m/b.mp4' && it.startFrame === 150)!;
  assert.equal(bTail.srcInFrame ?? 0, 150, 'tail segment source point advances to the cut point');
  const bHead = s1.items.find((it) => it.src === '/m/b.mp4' && it.startFrame === 0)!;
  assert.ok(bHead.keyframes?.opacity?.length && bTail.keyframes?.opacity?.length, 'keyframes are preserved across the split segments');
  const mix = s1.items.find((it) => it.id === 'mix')!;
  assert.equal(`${mix.startFrame}:${mix.durationInFrames}`, '0:300', 'audio track is completely untouched (no ripple)');
}

// ── 2. Interval touches the clip head: single cut on the right boundary, delete [0,150) ──
{
  const s0 = baseState();
  const plan = planCamSwitch([s0.items[0]], [s0.items[1]], 0, 150, makeId);
  assert.equal(plan.actions.length, 2, '1 cut + 1 delete');
  assert.deepEqual(spansOf(applyPlan(s0, plan.actions), '/m/b.mp4'), [[150, 300]], 'only the tail segment remains');
}

// ── 3. The interval is the full clip: zero cuts, whole-segment deletion ──
{
  const s0 = baseState();
  const plan = planCamSwitch([s0.items[0]], [s0.items[1]], 0, 300, makeId);
  assert.deepEqual(plan.actions.map((a) => a.type), ['remove'], 'the whole segment is deleted directly');
  assert.deepEqual(spansOf(applyPlan(s0, plan.actions), '/m/b.mp4'), [], 'camB is emptied');
}

// ── 4. Disjoint: zero action; coverage gap is counted in frames ──
{
  const s0 = baseState();
  const far = clip('camD', 'V3', 500, 100, '/m/d.mp4');
  assert.equal(planCamSwitch([s0.items[0]], [far], 60, 150, makeId).actions.length, 0, 'zero actions when outside the interval');
  const shortTarget = clip('camA2', 'V1', 0, 100, '/m/a.mp4');
  const plan = planCamSwitch([shortTarget], [s0.items[1]], 60, 200, makeId);
  assert.equal(plan.coverageGapFrames, 100, 'target covers only 40 frames, 100 frames short');
  assert.equal(coveredFrames([shortTarget], 60, 200), 40, 'coveredFrames count');
}

// ── 5. Tool layer: single batch submission + geometric consistency; multiple segments from the same source count as targets ──
{
  let s = baseState();
  let batches = 0;
  const ctx = {
    getState: () => s,
    commands: { batch: (actions: AtomicAction[]) => { batches++; s = actions.reduce((st, a) => reduce(st, a as Action), s); } },
  } as unknown as Parameters<typeof execChangeCam>[1];
  const r = execChangeCam({ itemIds: ['camA', 'camB', 'camC'], targetItemId: 'camA', fromSeconds: 2, toSeconds: 5 }, ctx) as Record<string, unknown>;
  assert.equal(r.error, undefined, `no error (got ${String(r.error)})`);
  assert.equal(batches, 1, 'exactly one batch (one-step undo)');
  assert.deepEqual(spansOf(s, '/m/b.mp4'), [[0, 60], [150, 300]], 'tool-layer geometry matches the planner');
  assert.equal((r.removedSegments as unknown[]).length, 2, 'reports two removed segments');

  // The second cut: camB has already been split into two segments, and only the current segment id is listed; the target's same-source segment must not be accidentally deleted.
  const bSegs = s.items.filter((it) => it.src === '/m/b.mp4').map((it) => it.id);
  const r2 = execChangeCam({ itemIds: ['camA', ...bSegs], targetItemId: 'camA', fromSeconds: 6, toSeconds: 8 }, ctx) as Record<string, unknown>;
  assert.equal(r2.error, undefined, 'second switch ok');
  assert.deepEqual(spansOf(s, '/m/b.mp4'), [[0, 60], [150, 180], [240, 300]], 'the second cut carves out [180,240) as well');
  assert.deepEqual(spansOf(s, '/m/a.mp4'), [[0, 300]], 'target is still intact');
}

// ── 6. Boundary check: each error path ──
{
  const s0 = baseState();
  const ctx = { getState: () => s0, commands: { batch: () => { throw new Error('must not commit'); } } } as unknown as Parameters<typeof execChangeCam>[1];
  const err = (args: Record<string, unknown>) => (execChangeCam(args, ctx) as { error?: string }).error ?? '';
  assert.match(err({ itemIds: ['camA'], targetItemId: 'camA', fromSeconds: 0 }), /at least 2/, 'fewer than 2 camera angles');
  assert.match(err({ itemIds: ['camA', 'nope'], targetItemId: 'camA', fromSeconds: 0 }), /not found/, 'unknown id');
  assert.match(err({ itemIds: ['camA', 'mix'], targetItemId: 'camA', fromSeconds: 0 }), /must be video/, 'non-video camera angle');
  assert.match(err({ itemIds: ['camA', 'camB'], targetItemId: 'camC', fromSeconds: 0 }), /must be one of/, 'target is not in the group');
  assert.match(err({ itemIds: ['camA', 'camB'], targetItemId: 'camA', fromSeconds: -1 }), /fromSeconds/, 'negative start point');
  assert.match(err({ itemIds: ['camA', 'camB'], targetItemId: 'camA', fromSeconds: 5, toSeconds: 5 }), /empty switch range/, 'empty interval');
  const shortA = { ...s0, items: s0.items.map((it) => (it.id === 'camA' ? { ...it, durationInFrames: 30 } : it)) };
  const ctx2 = { getState: () => shortA, commands: { batch: () => { throw new Error('must not commit'); } } } as unknown as Parameters<typeof execChangeCam>[1];
  assert.match((execChangeCam({ itemIds: ['camA', 'camB'], targetItemId: 'camA', fromSeconds: 5, toSeconds: 8 }, ctx2) as { error?: string }).error ?? '', /no clip in the switch range/, 'rejected when the target has zero coverage');
  const locked = { ...s0, tracks: { ...s0.tracks, V2: { kind: 'video' as const, locked: true } } };
  const ctx3 = { getState: () => locked, commands: { batch: () => { throw new Error('must not commit'); } } } as unknown as Parameters<typeof execChangeCam>[1];
  assert.match((execChangeCam({ itemIds: ['camA', 'camB'], targetItemId: 'camA', fromSeconds: 0, toSeconds: 2 }, ctx3) as { error?: string }).error ?? '', /locked/, 'rejected for a locked track');
}

// ── 7. Multiple segments from the same source: the target camera's remaining segments must not be deleted as "other camera angles", and are included in the coverage together ──
{
  let s: TimelineState = {
    fps: 30, width: 1920, height: 1080, selectedId: null,
    tracks: { V1: { kind: 'video' }, V2: { kind: 'video' } }, trackOrder: ['V1', 'V2'],
    items: [
      clip('a1', 'V1', 0, 100, '/m/a.mp4'),
      clip('a2', 'V1', 100, 200, '/m/a.mp4', { srcInFrame: 100 }),
      clip('camB', 'V2', 0, 300, '/m/b.mp4'),
    ],
  };
  const ctx = {
    getState: () => s,
    commands: { batch: (actions: AtomicAction[]) => { s = actions.reduce((st, a) => reduce(st, a as Action), s); } },
  } as unknown as Parameters<typeof execChangeCam>[1];
  const r = execChangeCam({ itemIds: ['a1', 'a2', 'camB'], targetItemId: 'a1', fromSeconds: 2, toSeconds: 6 }, ctx) as Record<string, unknown>;
  assert.equal(r.error, undefined, 'same-src switch ok');
  assert.deepEqual(spansOf(s, '/m/a.mp4'), [[0, 100], [100, 300]], "all of the target's same-source segments are kept");
  assert.deepEqual(spansOf(s, '/m/b.mp4'), [[0, 60], [180, 300]], 'camB has [60,180) carved out');
  assert.equal(r.coverageGapSeconds, 0, 'no gap in cross-segment coverage');
}

console.log('camSwitch.verify: all assertions passed');
