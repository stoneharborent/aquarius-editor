// Magnetic (Final Cut Pro) trimming: shared rules for the pointer commit path and
// the live drag preview, so what the timeline draws mid-drag is exactly what the
// reducer's ripple retime commits on release.
//
// The rule: trimming a clip edge NEVER leaves dead space. The clip's start frame
// is anchored, its right edge carries the trim, and every later clip on the tracks
// the trimmed clip (plus its linked members) occupies rides that same end delta.
// Holding Option/Alt at pointer-down opts one gesture out and restores the old
// non-magnetic behaviour (left trim moves the start, right trim leaves a gap).
import { expandSyncLockShifts, linkedItemIds } from '../../editor/linkGroups';
import type { TimelineState } from '../../editor/types';
import type { Drag, EditMode } from './timelineUtil';

/** True when this gesture trims with the magnetic timeline (the default). */
export function isMagneticTrim(drag: Pick<Drag, 'mode' | 'alt'>, editMode: EditMode): boolean {
  // Rate stretch re-times the source instead of trimming it; it keeps its own geometry.
  if (editMode === 'rate-stretch') return false;
  if (drag.mode !== 'trim-left' && drag.mode !== 'trim-right') return false;
  return !drag.alt;
}

/**
 * How far the trimmed clip's right edge moves for the drag's current (already
 * clamped) delta. Left trims anchor the start, so their end moves the other way.
 * Returns 0 for anything that does not ripple.
 */
export function trimRippleEndDelta(drag: Drag, editMode: EditMode): number {
  if (!isMagneticTrim(drag, editMode)) return 0;
  return drag.mode === 'trim-left' ? -drag.deltaF : drag.deltaF;
}

/**
 * The item-id → start-frame shift the reducer's ripple retime will apply for this
 * drag. Mirrors `applyClipAction`'s `retime` ripple branch (linked members are
 * protected, sync-lock groups are expanded, a negative start rejects the whole
 * shift) so the preview cannot promise a layout the commit will refuse.
 */
export function trimRipplePreviewShifts(
  state: TimelineState,
  drag: Drag | null,
  editMode: EditMode,
): ReadonlyMap<string, number> | null {
  if (!drag) return null;
  const endDelta = trimRippleEndDelta(drag, editMode);
  if (endDelta === 0) return null;
  const linkedIds = new Set(linkedItemIds(state, [drag.id]));
  const linkedMembers = state.items.filter((item) => linkedIds.has(item.id));
  const base = new Map<string, number>();
  for (const item of state.items) {
    if (linkedIds.has(item.id)) continue;
    const rides = linkedMembers.some((member) => item.track === member.track
      && item.startFrame >= member.startFrame + member.durationInFrames);
    if (rides) base.set(item.id, endDelta);
  }
  const shifts = expandSyncLockShifts(state, base);
  if (!shifts) return null;
  if ([...linkedIds].some((id) => shifts.has(id))) return null;
  for (const item of state.items) {
    const delta = shifts.get(item.id);
    if (delta === undefined) continue;
    if (state.tracks?.[item.track]?.locked || item.startFrame + delta < 0) return null;
  }
  return shifts.size ? shifts : null;
}
