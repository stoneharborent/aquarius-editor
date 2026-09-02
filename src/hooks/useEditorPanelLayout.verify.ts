import assert from 'node:assert/strict';
import {
  TIMELINE_RULER_HEIGHT,
  TIMELINE_TOOLBAR_HEIGHT,
  TIMELINE_TRAILING_SPACE,
  timelineContentFitHeight,
} from '../../shared/timeline-geometry';
import {
  MIN_TIMELINE_RATIO,
  resolveTimelineHeight,
  timelineRowTrack,
} from './useEditorPanelLayout';

const CONTENT = 761; // the layout baseline: a 802px window minus the 41px titlebar
const ROW = 56; // one track row at the default track scale
const CHROME = TIMELINE_TOOLBAR_HEIGHT + TIMELINE_RULER_HEIGHT;

// The inch is Royce's "an inch or so": 1 CSS inch = 96 CSS px.
assert.equal(TIMELINE_TRAILING_SPACE, 96);

// --- content fit -----------------------------------------------------------
// Three tracks: chrome + rows + exactly one inch of breathing space, nothing more.
assert.equal(timelineContentFitHeight(3 * ROW), CHROME + 3 * ROW + 96);
assert.equal(timelineContentFitHeight(0), CHROME + 96);
// A tab strip sharing the row is budgeted for, so it never eats the inch.
assert.equal(timelineContentFitHeight(3 * ROW, 33), CHROME + 3 * ROW + 33 + 96);

// --- shorter than the ceiling → the panel shrinks to content + the inch -----
const ceilingRatio = 0.6; // a divider dragged well down the window
const threeTracks = timelineContentFitHeight(3 * ROW);
assert.ok(threeTracks < CONTENT * ceilingRatio, 'three tracks must fit under this ceiling');
assert.equal(
  resolveTimelineHeight({ fitHeight: threeTracks, contentHeight: CONTENT, timelineRatio: ceilingRatio }),
  threeTracks,
);

// --- taller than the ceiling → the panel stops at the dragged ceiling -------
const manyTracks = timelineContentFitHeight(12 * ROW);
assert.ok(manyTracks > CONTENT * ceilingRatio, 'twelve tracks must overflow this ceiling');
assert.equal(
  resolveTimelineHeight({ fitHeight: manyTracks, contentHeight: CONTENT, timelineRatio: ceilingRatio }),
  CONTENT * ceilingRatio,
);

// --- never below the existing minimum --------------------------------------
const empty = timelineContentFitHeight(0);
const floor = CONTENT * MIN_TIMELINE_RATIO;
assert.ok(empty < floor, 'an empty timeline is shorter than the minimum panel height');
assert.equal(
  resolveTimelineHeight({ fitHeight: empty, contentHeight: CONTENT, timelineRatio: ceilingRatio }),
  floor,
);
assert.equal(floor, 260, 'the minimum panel height is still the historical 260px at baseline');

// A ceiling dragged all the way to the minimum wins over the floor, so the
// clamp never inverts.
assert.equal(
  resolveTimelineHeight({ fitHeight: empty, contentHeight: CONTENT, timelineRatio: MIN_TIMELINE_RATIO }),
  floor,
);

// --- growing with the track count ------------------------------------------
const heights = [2, 3, 4, 5].map((tracks) => resolveTimelineHeight({
  fitHeight: timelineContentFitHeight(tracks * ROW),
  contentHeight: CONTENT,
  timelineRatio: ceilingRatio,
}));
for (let i = 1; i < heights.length; i += 1) {
  assert.ok(heights[i]! >= heights[i - 1]!, 'adding a track never shrinks the panel');
}
// Once clear of the floor, each extra track adds exactly one row.
assert.equal(heights[3]! - heights[2]!, ROW);

// Alt+wheel track-height zoom moves the panel the same way, because it moves
// the summed row heights the timeline already computes.
assert.equal(
  resolveTimelineHeight({ fitHeight: timelineContentFitHeight(4 * ROW * 1.5), contentHeight: CONTENT, timelineRatio: 0.75 }),
  CHROME + 4 * ROW * 1.5 + 96,
);

// --- before the timeline mounts, the stored ratio still rules --------------
assert.equal(
  resolveTimelineHeight({ fitHeight: null, contentHeight: CONTENT, timelineRatio: ceilingRatio }),
  CONTENT * ceilingRatio,
);

// --- the CSS grid track mirrors the numeric rule ----------------------------
assert.equal(timelineRowTrack(null, ceilingRatio), `calc((100vh - 41px) * ${ceilingRatio})`);
assert.equal(
  timelineRowTrack(threeTracks, ceilingRatio),
  `clamp(calc((100vh - 41px) * ${MIN_TIMELINE_RATIO}), ${threeTracks}px, calc((100vh - 41px) * ${ceilingRatio}))`,
);

console.log('useEditorPanelLayout.verify: content-fit timeline height passed');
