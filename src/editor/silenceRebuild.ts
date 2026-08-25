// remove_silence's edit planner: translates "silent intervals in the source audio" into a
// sequence of split/remove actions (one batch = one undo step). Deliberately reuses only
// split (transcript word segmentation, keyframe segmentation, and fade in/out are all handled
// by it) and remove (same-track ripple close-up) — no new reducer action is added.
import type { Action } from './reduce';
import type { TimelineItem } from './types';
import { sourceFramesToTimelineFrames, sourceWindowForTimelineRange } from './sourceLimit';
import type { SilenceSpan } from '../audio/silence';
import { hasOperationalTranscript } from '../transcript/types';

/** Cutting segments this small is pointless: a kept segment between silent spans shorter than
 *  this many frames gets merged into the surrounding cuts and dropped too. */
const MIN_KEEP_FRAMES = 6;
/** No action is taken when a silent span is shorter than this many frames (the frame-domain
 *  floor beneath the detection layer's minSilenceMs). */
const MIN_CUT_FRAMES = 2;

export interface PlannedRemoval {
  actions: Action[];
  /** Total number of frames removed (timeline frames) */
  removedFrames: number;
  /** The actual cut spans (in the clip's visible local frames) */
  cuts: Array<{ fromFrame: number; toFrame: number }>;
}

/** Source-millisecond silent spans → the clip's visible local frame spans (clamped to the clip's
 *  source window; edge and tiny spans are trimmed/merged). */
export function spansToLocalCuts(
  item: Pick<TimelineItem, 'durationInFrames' | 'srcInFrame' | 'playbackRate'>,
  spans: readonly SilenceSpan[],
  fps: number,
): Array<{ fromFrame: number; toFrame: number }> {
  const window = sourceWindowForTimelineRange(item, 0, item.durationInFrames);
  const clamped = spans
    .map((span) => ({
      fromFrame: Math.max(0, Math.round(sourceFramesToTimelineFrames(
        item,
        (span.startMs / 1000) * fps - window.startFrame,
      ))),
      toFrame: Math.min(item.durationInFrames, Math.round(sourceFramesToTimelineFrames(
        item,
        (span.endMs / 1000) * fps - window.startFrame,
      ))),
    }))
    .filter((c) => c.toFrame - c.fromFrame >= MIN_CUT_FRAMES)
    .sort((a, b) => a.fromFrame - b.fromFrame);
  // A kept segment between two adjacent silent spans that's too small to matter → merge it into
  // the surrounding cuts (interval merge).
  const merged: Array<{ fromFrame: number; toFrame: number }> = [];
  for (const cut of clamped) {
    const prev = merged[merged.length - 1];
    if (prev && cut.fromFrame - prev.toFrame < MIN_KEEP_FRAMES) prev.toFrame = Math.max(prev.toFrame, cut.toFrame);
    else merged.push({ ...cut });
  }
  // Tiny kept fragments at the very start/end are folded in too.
  if (merged.length) {
    if (merged[0]!.fromFrame < MIN_KEEP_FRAMES) merged[0]!.fromFrame = 0;
    const last = merged[merged.length - 1]!;
    if (item.durationInFrames - last.toFrame < MIN_KEEP_FRAMES) last.toFrame = item.durationInFrames;
  }
  // Swallowed whole: the detection layer claims "it's all silence" but somehow passed the voice
  // reference gate — shouldn't happen, so bail out conservatively.
  if (merged.length === 1 && merged[0]!.fromFrame === 0 && merged[0]!.toFrame === item.durationInFrames) return [];
  return merged;
}

/**
 * Turns silent spans into a split/remove action sequence. Actions are applied sequentially
 * (batch semantics): split's atFrame uses the timeline coordinates "after the previous step",
 * and remove's same-track ripple shift-left is compensated for span by span in this function.
 * newId is injected by the caller (crypto.randomUUID in the browser; deterministic in verify).
 */
export function planSilenceRemoval(
  item: Pick<TimelineItem, 'id' | 'startFrame' | 'durationInFrames'>,
  cuts: ReadonlyArray<{ fromFrame: number; toFrame: number }>,
  makeId: () => string,
): PlannedRemoval {
  const actions: Action[] = [];
  const planned: Array<{ fromFrame: number; toFrame: number }> = [];
  let tailId = item.id; // id of the current "unprocessed remainder to the right"
  let tailStart = item.startFrame; // timeline start of this remainder (updated as the ripple shifts it left)
  let tailLocal = 0; // the clip's visible local frame corresponding to the remainder's start
  let removed = 0;

  for (const cut of cuts) {
    if (!tailId) break;
    const from = Math.max(cut.fromFrame, tailLocal);
    const to = Math.min(cut.toFrame, item.durationInFrames);
    if (to - from < MIN_CUT_FRAMES) continue;
    const cutsTail = to >= item.durationInFrames; // silence runs to the end of the clip

    if (from <= tailLocal) {
      // The silent span sits right at the start of the remainder: cut it out and remove it.
      if (cutsTail) {
        // The whole remainder is silent: remove it outright.
        actions.push({ type: 'remove', ripple: true, id: tailId });
        planned.push({ fromFrame: from, toFrame: to });
        removed += to - from;
        tailId = '';
        break;
      }
      const restId = makeId();
      actions.push({ type: 'split', id: tailId, atFrame: tailStart + (to - tailLocal), newId: restId });
      actions.push({ type: 'remove', ripple: true, id: tailId });
      planned.push({ fromFrame: from, toFrame: to });
      removed += to - from;
      tailId = restId; // remove's ripple pulls the rest back to tailStart
      tailLocal = to;
      continue;
    }

    // The silent span is in the middle/end of the remainder: split off the kept segment on the left first.
    const silentId = makeId();
    actions.push({ type: 'split', id: tailId, atFrame: tailStart + (from - tailLocal), newId: silentId });
    if (cutsTail) {
      actions.push({ type: 'remove', ripple: true, id: silentId });
      planned.push({ fromFrame: from, toFrame: to });
      removed += to - from;
      tailId = '';
      break;
    }
    const restId = makeId();
    actions.push({ type: 'split', id: silentId, atFrame: tailStart + (from - tailLocal) + (to - from), newId: restId });
    actions.push({ type: 'remove', ripple: true, id: silentId });
    planned.push({ fromFrame: from, toFrame: to });
    removed += to - from;
    tailId = restId;
    tailStart = tailStart + (from - tailLocal); // the remainder is pulled by the ripple to the silent span's original start
    tailLocal = to;
  }

  return { actions, removedFrames: removed, cuts: planned };
}

/** A remove_silence clip that must not be touched: gives a readable reason, and the tool layer reports it verbatim. */
export function silenceRemovalBlocker(item: TimelineItem): string | null {
  if (item.kind !== 'video' && item.kind !== 'audio') return `kind=${item.kind} has no audio`;
  if (!item.src) return 'no media source';
  if ((item.playbackRate ?? 1) !== 1) return 'speed-changed (playbackRate≠1) — remove silence before changing speed, or use clean_script';
  if (item.zoom) return 'has animated zoom — splitting would break the zoom curve; remove zoom first';
  if (hasOperationalTranscript(item) && (item.deletedWordIdx?.length || item.silenceFrames !== undefined || item.gapCapsMs)) {
    return 'already has word-level edits/silence compaction — for a transcribed clip, use clean_script\'s silence cap instead (it works precisely off word gaps)';
  }
  return null;
}
