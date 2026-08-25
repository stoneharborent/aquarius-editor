// Runnable check: `npx tsx src/editor/snap.verify.ts`.
// Two new rules for verifying adsorption: (1) Hysteresis - after being sucked, you have to go out of 1.5 times the radius before releasing, otherwise it will be on the boundary
// It will shake back and forth; (2) Weighted by type - the adsorption radius of the play head is larger, and it wins when it is equidistant.
import assert from 'node:assert/strict';
import {
  findClosestSnapPoint, snapDraggedEdges, sortTimelineSnapPoints, STICKY_RELEASE, type SnapPoint,
} from './snap';

const THRESHOLD = 4; // frame
const base = { baseStart: 100, baseDuration: 50, points: [] as SnapPoint[], thresholdFrames: THRESHOLD };

// ── Weighted: When isometric the playhead wins over the edge of the clip, and its radius is indeed wider ──
{
  const points: SnapPoint[] = [
    { frame: 100, type: 'item-end', itemId: 'x' },
    { frame: 108, type: 'playhead' },
  ];
  assert.equal(findClosestSnapPoint(points, 104, THRESHOLD)?.type, 'playhead', 'at equal 4-frame distance, the playhead wins');

  const farPlayhead: SnapPoint[] = [{ frame: 106, type: 'playhead' }];
  assert.equal(findClosestSnapPoint(farPlayhead, 100, THRESHOLD)?.type, 'playhead', '6 frames is still within the playhead\'s 1.5x radius');
  const farEdge: SnapPoint[] = [{ frame: 106, type: 'item-end', itemId: 'x' }];
  assert.equal(findClosestSnapPoint(farEdge, 100, THRESHOLD), null, 'the same 6 frames is already out of reach for a clip edge');
}

// ── Hysteresis: Move slightly after sucking and still bite the same frame ──
{
  const points: SnapPoint[] = [{ frame: 120, type: 'item-start', itemId: 'x' }];
  const first = snapDraggedEdges({ ...base, points, mode: 'move', rawDelta: 18 }); // Probe 118
  assert.equal(first.snapAt, 120, 'snaps as soon as it enters the radius');
  assert.equal(first.deltaF, 20);
  assert.ok(first.hold);

  // Move out 5 frames: without hysteresis it would release (past the threshold of 4); with hysteresis it should keep holding (but not past 4x1.5=6)
  const held = snapDraggedEdges({ ...base, points, mode: 'move', rawDelta: 25, hold: first.hold });
  assert.equal(held.snapAt, 120, 'still within the release radius, stays snapped');
  assert.equal(held.deltaF, 20);

  const released = snapDraggedEdges({ ...base, points, mode: 'move', rawDelta: 27, hold: first.hold });
  assert.equal(released.snapAt, null, 'releases after moving past the 1.5x radius');
  assert.equal(released.deltaF, 27, 'reverts to the raw delta once released');

  // Do not pass hold = old behavior: the same displacement will not bite
  const stateless = snapDraggedEdges({ ...base, points, mode: 'move', rawDelta: 25 });
  assert.equal(stateless.snapAt, null);
}

// ── If the adsorption target disappears (for example, the clip is deleted), you must release it immediately, and you cannot bite the ghost ──
{
  const hold = { frame: 120, edge: 'start' as const, type: 'item-start' as const };
  const gone = snapDraggedEdges({ ...base, points: [], mode: 'move', rawDelta: 21, hold });
  assert.equal(gone.snapAt, null);
  assert.equal(gone.deltaF, 21);
}

// ── Hold remembers which side: trim-left should not inherit the record that is sucked at the end when move ──
{
  const points: SnapPoint[] = [{ frame: 155, type: 'item-start', itemId: 'x' }];
  const moved = snapDraggedEdges({ ...base, points, mode: 'move', rawDelta: 4 }); // Tail edge probe 154
  assert.equal(moved.hold?.edge, 'end', 'during move, the tail edge is what snaps');
  const trimmed = snapDraggedEdges({ ...base, points, mode: 'trim-left', rawDelta: 4, hold: moved.hold });
  assert.equal(trimmed.snapAt, null, "trim-left only looks at the head edge, so a tail-edge hold doesn't apply");
}

// ── trim-right only detects the tail edge, and there is still hysteresis ──
{
  const points: SnapPoint[] = [{ frame: 160, type: 'item-end', itemId: 'x' }];
  const first = snapDraggedEdges({ ...base, points, mode: 'trim-right', rawDelta: 8 }); // tail edge 158
  assert.equal(first.snapAt, 160);
  assert.equal(first.deltaF, 10);
  const held = snapDraggedEdges({ ...base, points, mode: 'trim-right', rawDelta: 15, hold: first.hold });
  assert.equal(held.snapAt, 160, `the release radius is ${THRESHOLD * STICKY_RELEASE} frames`);
}

// ── When there is no target at all, the displacement is returned ──
{
  const none = snapDraggedEdges({ ...base, points: [{ frame: 900, type: 'playhead' }], mode: 'move', rawDelta: 7 });
  assert.deepEqual([none.deltaF, none.snapAt, none.hold], [7, null, null]);
}

// ── Sorting + binary search is result-identical, including equal-distance tie order ──
{
  const points: SnapPoint[] = [
    { frame: 108, type: 'item-start', itemId: 'later-in-registry' },
    { frame: 92, type: 'item-end', itemId: 'earlier-in-registry' },
    { frame: 500, type: 'marker-start', markerId: 'far' },
  ];
  const probes = [88, 92, 96, 100, 104, 108, 112];
  const before = probes.map((frame) => findClosestSnapPoint(points, frame, 10));
  const sorted = sortTimelineSnapPoints(points);
  const after = probes.map((frame) => findClosestSnapPoint(sorted, frame, 10));
  assert.deepEqual(after, before, 'after sorting, binary search must preserve equal-distance and boundary results');
  assert.equal(findClosestSnapPoint(sorted, 100, 10)?.itemId, 'earlier-in-registry');
}

console.log('snap.verify: ok (type weighting/hysteresis hold & release/immediate release on vanished target/edge ownership/trim-right)');
