/** Timeline chrome and default row geometry shared outside React components. */
export const TIMELINE_TOOLBAR_HEIGHT = 36;
export const TIMELINE_RULER_HEIGHT = 28;
export const TIMELINE_DEFAULT_TRACK_HEIGHT = 56;
export const TIMELINE_MIN_VISIBLE_TRACKS = 4;
export const TIMELINE_MAX_VISIBLE_TRACKS = 6;

export function timelineHeightForVisibleTracks(trackCount: number): number {
  const visibleTrackCount = Math.min(
    TIMELINE_MAX_VISIBLE_TRACKS,
    Math.max(TIMELINE_MIN_VISIBLE_TRACKS, Math.floor(trackCount)),
  );
  return TIMELINE_TOOLBAR_HEIGHT
    + TIMELINE_RULER_HEIGHT
    + TIMELINE_DEFAULT_TRACK_HEIGHT * visibleTrackCount;
}

export const TIMELINE_MIN_HEIGHT = timelineHeightForVisibleTracks(TIMELINE_MIN_VISIBLE_TRACKS);
export const TIMELINE_MAX_HEIGHT = timelineHeightForVisibleTracks(TIMELINE_MAX_VISIBLE_TRACKS);

/**
 * Breathing room kept under the last track — Royce's "an inch or so of space
 * after the last audio track". 1 CSS inch is 96 CSS px by definition, and the
 * desktop zoom factor already scales CSS px, so nothing compensates for it here.
 */
export const TIMELINE_TRAILING_SPACE = 96;

/**
 * Height the timeline panel wants for the tracks it currently has: its own
 * chrome (toolbar + ruler), every track row, and the trailing inch. Pass the
 * summed row heights the timeline already computes, so Alt+wheel track-height
 * zoom feeds straight into the panel height. `extraChromeHeight` covers strips
 * that share the panel row (the sequence tab bar) when they are on screen.
 */
export function timelineContentFitHeight(tracksHeight: number, extraChromeHeight = 0): number {
  return TIMELINE_TOOLBAR_HEIGHT
    + TIMELINE_RULER_HEIGHT
    + Math.max(0, tracksHeight)
    + Math.max(0, extraChromeHeight)
    + TIMELINE_TRAILING_SPACE;
}
