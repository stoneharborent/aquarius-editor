// Where the three Final Cut edit keys put the selected library item.
//
// docs/fcp-shortcut-map.md reserved E, W and Q for exactly this. The rules are
// Final Cut's, expressed in this app's track model:
//
//   E — Append   after everything already on the item's own lane (V1 / A1).
//   W — Insert   at the playhead on that lane, rippling later clips to the right.
//   Q — Connect  at the playhead on a lane ABOVE the main one, so the graphic
//                sits over the story rather than in it. The first lane that is
//                free across the clip's whole length wins; if every lane above
//                is busy there, a new one is made.
//
// This module is pure: it reads a timeline and returns what to do. The command
// calls live in useEditorActions, which is what makes it testable without a
// renderer or a mounted editor.

import {
  defaultTrackId, timelineTrackIds, trackKind, type TimelineState,
} from '../editor/timelineTypes';
import type { TrackId, TrackKind } from '../editor/trackTypes';

export type LibraryEdit = 'append' | 'insert' | 'connect';

export interface LibraryPlacement {
  /**
   * Make a new lane of this kind first, at this index within its own kind
   * (video counts bottom-up, so `videoLaneCount` means "a new top lane"), and
   * place onto the track it returns. Absent means `track` already names one.
   */
  readonly createTrack?: { readonly kind: TrackKind; readonly order: number };
  /** Existing lane to place on. Absent only when `createTrack` is present. */
  readonly track?: TrackId;
  /** Absent means "after the last clip on the lane" — the reducer's append. */
  readonly startFrame?: number;
  /** Push later clips on the lane to the right by the clip's length. */
  readonly ripple?: boolean;
}

/** The lane an asset of this kind belongs on by default. */
export function laneKindForAsset(kind: string): TrackKind {
  return kind === 'audio' ? 'audio' : 'video';
}

/**
 * Lanes of one kind, ordered the way their names count: V1 first (bottom-up for
 * video), A1 first (top-down for audio and captions) — see `trackAlias`.
 */
function lanesInNameOrder(state: TimelineState, kind: TrackKind): TrackId[] {
  const ids = timelineTrackIds(state).filter((id) => trackKind(state, id) === kind);
  return kind === 'video' ? ids.reverse() : ids;
}

function laneIsFree(
  state: TimelineState,
  track: TrackId,
  startFrame: number,
  durationInFrames: number,
): boolean {
  if (state.tracks?.[track]?.locked) return false;
  const end = startFrame + durationInFrames;
  return !state.items.some((item) => (
    item.track === track
    && item.startFrame < end
    && item.startFrame + item.durationInFrames > startFrame
  ));
}

export function libraryPlacement(
  state: TimelineState,
  edit: LibraryEdit,
  input: { kind: TrackKind; playhead: number; durationInFrames: number },
): LibraryPlacement {
  const { kind, durationInFrames } = input;
  const playhead = Math.max(0, Math.round(input.playhead));
  const lanes = lanesInNameOrder(state, kind);
  const main = defaultTrackId(state, kind) ?? lanes[0];

  // Append: no start frame at all — `add` puts the clip after the last one on
  // the lane for us, which is the definition of Append.
  if (edit === 'append') return main ? { track: main } : { createTrack: { kind, order: 0 } };

  if (edit === 'insert') {
    return main
      ? { track: main, startFrame: playhead, ripple: true }
      : { createTrack: { kind, order: 0 }, startFrame: playhead };
  }

  // Connect: the first lane above the main one that is clear for the whole clip.
  const above = main ? lanes.slice(lanes.indexOf(main) + 1) : lanes;
  const free = above.find((track) => laneIsFree(state, track, playhead, durationInFrames));
  if (free) return { track: free, startFrame: playhead };
  return { createTrack: { kind, order: lanes.length }, startFrame: playhead };
}
