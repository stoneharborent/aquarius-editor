import { useTimelinePanelHeight } from '../components/timeline/timelinePanelHeight';
import { usePersistedState } from './usePersistedState';

const HEADER_HEIGHT = 41;
const BASELINE_WIDTH = 1463;
const BASELINE_CONTENT_HEIGHT = 761;

const DEFAULT_LIBRARY_RATIO = 406 / BASELINE_WIDTH;
const DEFAULT_TIMELINE_RATIO = 350 / BASELINE_CONTENT_HEIGHT;
const MIN_LIBRARY_RATIO = 176 / BASELINE_WIDTH;
const MIN_PREVIEW_RATIO = 280 / BASELINE_WIDTH;
export const MIN_TIMELINE_RATIO = 260 / BASELINE_CONTENT_HEIGHT;
const MIN_UPPER_RATIO = 300 / BASELINE_CONTENT_HEIGHT;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteRatio(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function roundRatio(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function viewportWidth(): number {
  return typeof window === 'undefined' ? BASELINE_WIDTH : Math.max(1, window.innerWidth);
}

function contentHeight(): number {
  if (typeof window === 'undefined') return BASELINE_CONTENT_HEIGHT;
  return Math.max(1, window.innerHeight - HEADER_HEIGHT);
}

function normalizeRatios(library: number, timeline: number) {
  return {
    libraryRatio: clamp(
      finiteRatio(library, DEFAULT_LIBRARY_RATIO),
      MIN_LIBRARY_RATIO,
      1 - MIN_PREVIEW_RATIO,
    ),
    timelineRatio: clamp(
      finiteRatio(timeline, DEFAULT_TIMELINE_RATIO),
      MIN_TIMELINE_RATIO,
      1 - MIN_UPPER_RATIO,
    ),
  };
}

/** CSS length for the editor content area (everything under the titlebar). */
const CONTENT_HEIGHT_CALC = `(100vh - ${HEADER_HEIGHT}px)`;

/**
 * How tall the timeline panel is, in CSS px.
 *
 * The rule (Royce, 2026-09-02): the timeline follows its content — toolbar +
 * ruler + every track row + one CSS inch of breathing space under the last
 * track — so it grows as tracks are added and shrinks as they are removed, and
 * never leaves a slab of dead space under the last audio track.
 *
 * Two limits bracket that:
 *   - the floor is the long-standing minimum panel height (MIN_TIMELINE_RATIO);
 *   - the ceiling is wherever the user last dragged the divider. Dragging still
 *     works and now means "the most the timeline may grow to"; while the
 *     content is shorter than that, the panel sits at content + the inch and
 *     the preview keeps the rest. Once the content is taller, the panel stops
 *     at the ceiling and the timeline scrolls exactly as it always did — the
 *     inch is part of the scrolled content, so the last track can still be
 *     dragged into.
 *
 * Persistence is unchanged: only the dragged ratio is stored.
 */
export function resolveTimelineHeight(input: {
  fitHeight: number | null;
  contentHeight: number;
  timelineRatio: number;
}): number {
  const ceiling = input.contentHeight * input.timelineRatio;
  const floor = input.contentHeight * MIN_TIMELINE_RATIO;
  if (input.fitHeight === null || !Number.isFinite(input.fitHeight)) return ceiling;
  return clamp(input.fitHeight, Math.min(floor, ceiling), ceiling);
}

/**
 * The same rule as a CSS grid track, so window resizing and browser zoom keep
 * working without a JS resize loop. `clamp()` mirrors resolveTimelineHeight.
 */
export function timelineRowTrack(fitHeight: number | null, timelineRatio: number): string {
  const ceiling = `calc(${CONTENT_HEIGHT_CALC} * ${timelineRatio})`;
  if (fitHeight === null || !Number.isFinite(fitHeight)) return ceiling;
  return `clamp(calc(${CONTENT_HEIGHT_CALC} * ${MIN_TIMELINE_RATIO}), ${fitHeight}px, ${ceiling})`;
}

export interface EditorPanelLayout {
  gridTemplateColumns: string;
  gridTemplateRows: string;
  resizeLibrary: (delta: number) => void;
  resizeTimeline: (delta: number) => void;
}

/**
 * Keeps user-resized editor panels as viewport-relative ratios. CSS vw/calc
 * tracks then react to both window resizing and browser zoom without a JS
 * resize loop. Columns: library | divider | preview. The timeline spans the
 * full width, and its row height follows its content — see
 * resolveTimelineHeight for the rule.
 */
export function useEditorPanelLayout(): EditorPanelLayout {
  const [storedLibraryRatio, setLibraryRatio] = usePersistedState(
    'openchatcut.libraryRatio.ui-v2',
    DEFAULT_LIBRARY_RATIO,
  );
  const [storedTimelineRatio, setTimelineRatio] = usePersistedState(
    'openchatcut.timelineRatio.ui-v2',
    DEFAULT_TIMELINE_RATIO,
  );

  // Published by the mounted timeline; null before it mounts, and then the
  // panel falls back to the stored ratio exactly as it used to.
  const timelineFitHeight = useTimelinePanelHeight();

  const { libraryRatio, timelineRatio } = normalizeRatios(
    storedLibraryRatio,
    storedTimelineRatio,
  );

  const gridTemplateColumns = `${libraryRatio * 100}vw 0 minmax(0, 1fr)`;
  const gridTemplateRows = `${HEADER_HEIGHT}px minmax(0, 1fr) 0 ${timelineRowTrack(timelineFitHeight, timelineRatio)}`;

  const resizeLibrary = (delta: number) => setLibraryRatio((current) => roundRatio(clamp(
    finiteRatio(current, DEFAULT_LIBRARY_RATIO) + delta / viewportWidth(),
    MIN_LIBRARY_RATIO,
    1 - MIN_PREVIEW_RATIO,
  )));
  const resizeTimeline = (delta: number) => setTimelineRatio((current) => {
    const content = contentHeight();
    const stored = finiteRatio(current, DEFAULT_TIMELINE_RATIO);
    // Drag from where the divider actually sits. While the timeline is parked at
    // its content-fit height the stored ceiling can be well above the visible
    // edge, and a drag has to move the edge under the pointer, not the ceiling
    // it is hiding behind.
    const effective = timelineFitHeight === null
      ? stored
      : Math.min(stored, timelineFitHeight / content);
    return roundRatio(clamp(
      effective - delta / content,
      MIN_TIMELINE_RATIO,
      1 - MIN_UPPER_RATIO,
    ));
  });

  return { gridTemplateColumns, gridTemplateRows, resizeLibrary, resizeTimeline };
}
