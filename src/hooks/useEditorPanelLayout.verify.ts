import assert from 'node:assert/strict';
import {
  TIMELINE_RULER_HEIGHT,
  TIMELINE_TOOLBAR_HEIGHT,
  TIMELINE_TRAILING_SPACE,
  timelineContentFitHeight,
} from '../../shared/timeline-geometry';
import {
  MIN_TIMELINE_RATIO,
  TIMELINE_AUTO_MAX_RATIO,
  normalizeTimelineMode,
  resolveTimelineHeight,
  timelineRowTrack,
  type TimelineHeightMode,
} from './useEditorPanelLayout';

function close(actual: number, expected: number, what: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${what}: expected ~${expected}, got ${actual}`);
}

const CONTENT = 761; // the layout baseline: a 802px window minus the 41px titlebar
const ROW = 56; // one track row at the default track scale
const CHROME = TIMELINE_TOOLBAR_HEIGHT + TIMELINE_RULER_HEIGHT;
const GAP = 20; // the settled breathing space under the last track

// --- the gap -------------------------------------------------------------
// Royce asked for "an inch or so" (96px), saw it on the bench, asked for half
// of that (40px), saw it again and asked for half of that. 20px is the settled
// number.
assert.equal(TIMELINE_TRAILING_SPACE, GAP);

// --- content fit ----------------------------------------------------------
assert.equal(timelineContentFitHeight(3 * ROW), CHROME + 3 * ROW + GAP);
assert.equal(timelineContentFitHeight(0), CHROME + GAP);
// A tab strip sharing the row is budgeted for, so it never eats the gap.
assert.equal(timelineContentFitHeight(3 * ROW, 33), CHROME + 3 * ROW + 33 + GAP);

// The stored ratio a user may have dragged to before any of this existed. In
// AUTO it must be ignored entirely, and in MANUAL it must be honoured exactly.
const STORED_RATIO = 0.5;

function auto(fitHeight: number | null, timelineRatio = STORED_RATIO): number {
  return resolveTimelineHeight({ mode: 'auto', fitHeight, contentHeight: CONTENT, timelineRatio });
}
function manual(timelineRatio: number, fitHeight: number | null = timelineContentFitHeight(4 * ROW)): number {
  return resolveTimelineHeight({ mode: 'manual', fitHeight, contentHeight: CONTENT, timelineRatio });
}

// --- AUTO: fit + the gap, bracketed --------------------------------------
// Four rows, not three: with the gap down to 20px a three-track timeline no
// longer clears the 260px floor, so it is the wrong example for "auto sits
// exactly where the content puts it". The floor itself is checked below.
const fourTracks = timelineContentFitHeight(4 * ROW);
assert.equal(fourTracks, CHROME + 4 * ROW + GAP);
assert.ok(fourTracks > CONTENT * MIN_TIMELINE_RATIO, 'four tracks clear the floor');
assert.equal(auto(fourTracks), fourTracks, 'auto sits exactly at the content-fit height');
// The stored ratio has no say in AUTO — the whole point of the feature.
assert.equal(auto(fourTracks, 0.2), fourTracks);
assert.equal(auto(fourTracks, 0.6), fourTracks);

// Floor: an empty timeline is still no shorter than the historical minimum.
const floor = CONTENT * MIN_TIMELINE_RATIO;
assert.equal(floor, 260, 'the minimum panel height is still the historical 260px at baseline');
assert.ok(timelineContentFitHeight(0) < floor, 'an empty timeline is shorter than the minimum');
assert.equal(auto(timelineContentFitHeight(0)), floor);

// Ceiling: a project with more tracks than fit stops and scrolls.
const autoCeiling = CONTENT * TIMELINE_AUTO_MAX_RATIO;
const manyTracks = timelineContentFitHeight(20 * ROW);
assert.ok(manyTracks > autoCeiling, 'twenty tracks must overflow the auto ceiling');
close(auto(manyTracks), autoCeiling, 'auto stops at its ceiling');
// The auto ceiling never exceeds what a drag may reach, so the first pixel of a
// drag out of AUTO cannot snap the panel.
assert.ok(TIMELINE_AUTO_MAX_RATIO <= 1 - 300 / 761, 'auto may not out-grow the drag limit');

// --- AUTO: tracks and Alt+wheel move the panel ---------------------------
const growth = [2, 3, 4, 5].map((tracks) => auto(timelineContentFitHeight(tracks * ROW)));
for (let i = 1; i < growth.length; i += 1) {
  assert.ok(growth[i]! >= growth[i - 1]!, 'adding a track never shrinks the panel');
}
assert.equal(growth[3]! - growth[2]!, ROW, 'clear of the floor, each track adds exactly one row');
// Alt+wheel track-height zoom moves the summed row heights, so it moves the panel.
assert.equal(auto(timelineContentFitHeight(4 * ROW * 1.5)), CHROME + 4 * ROW * 1.5 + GAP);

// --- MANUAL: the panel is exactly where the divider was dragged ----------
close(manual(STORED_RATIO), CONTENT * STORED_RATIO, 'manual honours the dragged ratio');
// Dragged below the fit height: the panel shrinks and the tracks scroll.
const shortRatio = MIN_TIMELINE_RATIO;
assert.ok(CONTENT * shortRatio < fourTracks, 'this drag is shorter than the content');
close(manual(shortRatio), 260, 'dragged short');
// Dragged above the fit height: the panel grows and empty space appears.
const tallRatio = 0.6;
assert.ok(CONTENT * tallRatio > fourTracks, 'this drag is taller than the content');
close(manual(tallRatio), CONTENT * tallRatio, 'dragged tall');
// Tracks and Alt+wheel no longer move it — the user asked for this height.
for (const tracks of [0, 3, 12, 30]) {
  close(manual(tallRatio, timelineContentFitHeight(tracks * ROW)), CONTENT * tallRatio, 'manual ignores the track count');
}

// --- before the timeline mounts, the stored ratio still rules -------------
close(auto(null), CONTENT * STORED_RATIO, 'auto before the timeline mounts');
close(manual(STORED_RATIO, null), CONTENT * STORED_RATIO, 'manual before the timeline mounts');

// --- the CSS grid track mirrors the numeric rule --------------------------
const CALC = '(100vh - 41px)';
assert.equal(timelineRowTrack('manual', fourTracks, STORED_RATIO), `calc(${CALC} * ${STORED_RATIO})`);
assert.equal(timelineRowTrack('auto', null, STORED_RATIO), `calc(${CALC} * ${STORED_RATIO})`);
assert.equal(
  timelineRowTrack('auto', fourTracks, STORED_RATIO),
  `clamp(calc(${CALC} * ${MIN_TIMELINE_RATIO}), ${fourTracks}px, calc(${CALC} * ${TIMELINE_AUTO_MAX_RATIO}))`,
);

// --- the drag: seeded from the rendered height, first pixel counts --------
// A copy of useEditorPanelLayout.resizeTimeline's arithmetic. The hook itself is
// a React hook; this is the rule it applies, verified without a renderer.
const MIN_UPPER_RATIO = 300 / CONTENT;
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
function drag(state: { mode: TimelineHeightMode; ratio: number }, fitHeight: number | null, delta: number) {
  const rendered = resolveTimelineHeight({
    mode: state.mode,
    fitHeight,
    contentHeight: CONTENT,
    timelineRatio: clamp(state.ratio, MIN_TIMELINE_RATIO, 1 - MIN_UPPER_RATIO),
  });
  const ratio = clamp((rendered - delta) / CONTENT, MIN_TIMELINE_RATIO, 1 - MIN_UPPER_RATIO);
  return { mode: 'manual' as TimelineHeightMode, ratio, height: CONTENT * ratio };
}

// From AUTO with three tracks (a short panel), one pixel up grows it by one
// pixel — it does not jump to the stored ratio, and it does not sit still.
const autoState = { mode: 'auto' as TimelineHeightMode, ratio: STORED_RATIO };
const upOne = drag(autoState, fourTracks, -1);
assert.equal(upOne.mode, 'manual', 'a drag always switches to manual');
close(upOne.height, fourTracks + 1, 'the first pixel up moves one pixel');
// And one pixel down shrinks it by one, so both directions respond immediately.
const downOne = drag(autoState, fourTracks, 1);
close(downOne.height, fourTracks - 1, 'the first pixel down moves one pixel');

// A whole drag of 120px down from AUTO on a six-track project lands 120px below
// the fit height, below which the tracks scroll.
const sixTracks = timelineContentFitHeight(6 * ROW);
assert.ok(sixTracks < autoCeiling, 'six tracks still fit under the auto ceiling');
const dragged = drag(autoState, sixTracks, 120);
close(dragged.height, sixTracks - 120, 'a 120px drag moves 120px');
assert.ok(dragged.height > floor, 'and stays clear of the floor');
assert.ok(dragged.height < sixTracks, 'dragging down shrinks past the content');

// Continuing the drag in MANUAL keeps tracking the pointer one-for-one, and
// adding tracks under it changes nothing.
const more = drag({ mode: 'manual', ratio: dragged.ratio }, timelineContentFitHeight(9 * ROW), -40);
close(more.height, dragged.height + 40, 'the drag keeps tracking in manual');

// The drag is still bounded by the old limits.
assert.equal(drag(autoState, fourTracks, 10_000).ratio, MIN_TIMELINE_RATIO);
assert.equal(drag(autoState, fourTracks, -10_000).ratio, 1 - MIN_UPPER_RATIO);

// --- double-click restores AUTO ------------------------------------------
const reset = { mode: normalizeTimelineMode('auto'), ratio: dragged.ratio };
assert.equal(reset.mode, 'auto');
assert.equal(
  resolveTimelineHeight({ mode: reset.mode, fitHeight: fourTracks, contentHeight: CONTENT, timelineRatio: reset.ratio }),
  fourTracks,
  'back to fitting the tracks, whatever the drag left in the stored ratio',
);
// The dragged ratio survives the reset, so dragging again resumes from there.
close(manual(reset.ratio), CONTENT * reset.ratio, 'the dragged ratio survives the reset');

// --- persistence round-trip ----------------------------------------------
// usePersistedState stores JSON; both modes must survive that trip, and a
// stored ratio from *before* this change (no mode key at all) must read as
// AUTO. That is the decision (Royce, 2026-09-02): fitting the tracks is the
// point of the feature, so everyone gets it, and one drag brings the old
// height back — the stored ratio is never discarded.
for (const mode of ['auto', 'manual'] as const) {
  assert.equal(normalizeTimelineMode(JSON.parse(JSON.stringify(mode))), mode);
}
assert.equal(normalizeTimelineMode(undefined), 'auto', 'no stored mode → auto');
assert.equal(normalizeTimelineMode(null), 'auto', 'a missing key → auto');
assert.equal(normalizeTimelineMode('nonsense'), 'auto', 'a corrupt value → auto');
assert.equal(normalizeTimelineMode(''), 'auto');
// An upgrading user: stored ratio, no mode. The panel fits the tracks.
assert.equal(
  resolveTimelineHeight({
    mode: normalizeTimelineMode(undefined),
    fitHeight: fourTracks,
    contentHeight: CONTENT,
    timelineRatio: STORED_RATIO,
  }),
  fourTracks,
);
// A fresh install: no ratio either. Still auto, still the fit.
assert.equal(auto(fourTracks, 350 / 761), fourTracks);

console.log('useEditorPanelLayout.verify: auto/manual timeline panel height passed');
