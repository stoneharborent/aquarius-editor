import { useRef } from 'react';
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

/**
 * The most of the editor the timeline may take on its own in AUTO mode. A
 * project with a dozen tracks would otherwise push the preview off the screen
 * without anyone asking it to; past this the timeline scrolls, exactly as it
 * always did. Drag the divider if you want more than this.
 *
 * Three quarters is the intent, but it can never exceed what a drag is allowed
 * to reach (the preview keeps MIN_UPPER_RATIO whatever happens) — otherwise the
 * first pixel of a drag would snap the panel down to the drag limit instead of
 * following the pointer.
 */
export const TIMELINE_AUTO_MAX_RATIO = Math.min(0.75, 1 - MIN_UPPER_RATIO);

/**
 * How the timeline panel is being sized.
 *   - `auto`   — it follows its content (see resolveTimelineHeight).
 *   - `manual` — it is exactly where the user dragged the divider to.
 */
export type TimelineHeightMode = 'auto' | 'manual';

const DEFAULT_TIMELINE_MODE: TimelineHeightMode = 'auto';

export function normalizeTimelineMode(value: unknown): TimelineHeightMode {
  return value === 'manual' ? 'manual' : 'auto';
}

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
 * The rule (Royce, 2026-09-02) has two modes, and the divider switches between
 * them:
 *
 *   AUTO (the default, and where every project starts): the timeline follows
 *   its content — toolbar + ruler + every track row + TIMELINE_TRAILING_SPACE
 *   under the last track — so it grows as tracks are added and shrinks as they
 *   are removed, and never leaves a slab of dead space under the last audio
 *   track. It is bracketed by the long-standing minimum panel height
 *   (MIN_TIMELINE_RATIO) below and TIMELINE_AUTO_MAX_RATIO of the editor above;
 *   past that the timeline scrolls, with the trailing gap at the end of the
 *   scrolled content so a clip can still be dragged past the last track.
 *
 *   MANUAL: the panel is exactly the height the user dragged the divider to,
 *   which is what it did before the content-fit work. Dragging down below the
 *   fit height shrinks the panel and the tracks scroll; dragging up above it
 *   grows the panel and leaves empty space. Adding or removing tracks, and
 *   Alt+wheel track-height zoom, no longer move the panel — the user asked for
 *   this height and keeps it.
 *
 * Dragging the divider switches to MANUAL. Double-clicking it goes back to
 * AUTO. Both are persisted.
 */
export function resolveTimelineHeight(input: {
  mode: TimelineHeightMode;
  fitHeight: number | null;
  contentHeight: number;
  timelineRatio: number;
}): number {
  const dragged = input.contentHeight * input.timelineRatio;
  // MANUAL, and AUTO before any timeline has mounted and published a height,
  // both fall back to the stored ratio.
  if (input.mode === 'manual') return dragged;
  if (input.fitHeight === null || !Number.isFinite(input.fitHeight)) return dragged;
  const floor = input.contentHeight * MIN_TIMELINE_RATIO;
  const ceiling = input.contentHeight * TIMELINE_AUTO_MAX_RATIO;
  return clamp(input.fitHeight, Math.min(floor, ceiling), ceiling);
}

/**
 * The same rule as a CSS grid track, so window resizing and browser zoom keep
 * working without a JS resize loop. `clamp()` mirrors resolveTimelineHeight.
 */
export function timelineRowTrack(
  mode: TimelineHeightMode,
  fitHeight: number | null,
  timelineRatio: number,
): string {
  const dragged = `calc(${CONTENT_HEIGHT_CALC} * ${timelineRatio})`;
  if (mode === 'manual') return dragged;
  if (fitHeight === null || !Number.isFinite(fitHeight)) return dragged;
  return `clamp(calc(${CONTENT_HEIGHT_CALC} * ${MIN_TIMELINE_RATIO}), ${fitHeight}px, calc(${CONTENT_HEIGHT_CALC} * ${TIMELINE_AUTO_MAX_RATIO}))`;
}

export interface EditorPanelLayout {
  gridTemplateColumns: string;
  gridTemplateRows: string;
  resizeLibrary: (delta: number) => void;
  resizeTimeline: (delta: number) => void;
  /** Double-click on the timeline divider: back to fitting the tracks. */
  resetTimelineToFit: () => void;
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
  // The mode is a separate key on purpose. Anyone upgrading has a stored ratio
  // and no mode, and that reads as AUTO — which is the decision (Royce,
  // 2026-09-02): fitting the tracks is the whole point of the feature, so
  // everybody gets it, and one drag of the divider brings their old height
  // back. The stored ratio itself is left untouched, so nothing is lost.
  const [storedTimelineMode, setTimelineMode] = usePersistedState<TimelineHeightMode>(
    'openchatcut.timelineHeightMode.ui-v2',
    DEFAULT_TIMELINE_MODE,
  );

  // Published by the mounted timeline; null before it mounts, and then the
  // panel falls back to the stored ratio exactly as it used to.
  const timelineFitHeight = useTimelinePanelHeight();

  const { libraryRatio, timelineRatio } = normalizeRatios(
    storedLibraryRatio,
    storedTimelineRatio,
  );
  const timelineMode = normalizeTimelineMode(storedTimelineMode);

  // Pointer moves can arrive faster than React re-renders, so a drag reads the
  // live mode and fit height from refs rather than from this render's closure.
  const modeRef = useRef(timelineMode);
  modeRef.current = timelineMode;
  const fitHeightRef = useRef(timelineFitHeight);
  fitHeightRef.current = timelineFitHeight;

  const gridTemplateColumns = `${libraryRatio * 100}vw 0 minmax(0, 1fr)`;
  const gridTemplateRows = `${HEADER_HEIGHT}px minmax(0, 1fr) 0 ${timelineRowTrack(timelineMode, timelineFitHeight, timelineRatio)}`;

  const resizeLibrary = (delta: number) => setLibraryRatio((current) => roundRatio(clamp(
    finiteRatio(current, DEFAULT_LIBRARY_RATIO) + delta / viewportWidth(),
    MIN_LIBRARY_RATIO,
    1 - MIN_PREVIEW_RATIO,
  )));

  const resizeTimeline = (delta: number) => {
    const content = contentHeight();
    // Seed the drag from the height on screen right now, not from the stored
    // ratio: in AUTO the two are unrelated, and a drag that started from the
    // ratio would spend its first pixels closing that gap instead of moving the
    // edge under the pointer.
    const wasAuto = modeRef.current === 'auto';
    const fitHeight = fitHeightRef.current;
    modeRef.current = 'manual';
    if (wasAuto) setTimelineMode('manual');
    setTimelineRatio((current) => {
      const stored = finiteRatio(current, DEFAULT_TIMELINE_RATIO);
      const rendered = resolveTimelineHeight({
        mode: wasAuto ? 'auto' : 'manual',
        fitHeight,
        contentHeight: content,
        timelineRatio: clamp(stored, MIN_TIMELINE_RATIO, 1 - MIN_UPPER_RATIO),
      });
      return roundRatio(clamp(
        (rendered - delta) / content,
        MIN_TIMELINE_RATIO,
        1 - MIN_UPPER_RATIO,
      ));
    });
  };

  const resetTimelineToFit = () => {
    modeRef.current = 'auto';
    setTimelineMode('auto');
  };

  return { gridTemplateColumns, gridTemplateRows, resizeLibrary, resizeTimeline, resetTimelineToFit };
}
