export { SILENCE_TOOL_SCHEMAS, SILENCE_TOOL_NAMES } from './schemas/silence-tools';
// remove_silence - removes dead air (silent segments) via native WebAudio analysis; no network calls.
// Detection lives in src/audio/silence.ts (relative voice level + absolute floor + breath-pause gating);
// editing lives in src/editor/silenceRebuild.ts (split/remove as one action batch, single-step undo,
// with co-located ripple closure). The word-level path for transcribed clips belongs to clean_script; this tool gates on it.
import type { AgentContext } from '../context';
import type { TimelineItem } from '../../editor/types';
import type { Action } from '../../editor/reduce';
import { analyzeClipSilence, type SilenceSpan } from '../../audio/silence';
import { sourceRevisionOf } from '../../editor/mediaSourceRevision';
import { vadSilenceRemovalEnabled } from '../../audio/vad';
import { planSilenceRemoval, silenceRemovalBlocker, spansToLocalCuts } from '../../editor/silenceRebuild';

type Args = Record<string, unknown>;

type SilenceTargetItem = TimelineItem & { kind: 'video' | 'audio' };

function targetItems(ctx: AgentContext, itemId: unknown): SilenceTargetItem[] | { error: string } {
  const q = typeof itemId === 'string' ? itemId.trim() : '';
  const clips = ctx.getState().items.filter(
    (item): item is SilenceTargetItem => item.kind === 'video' || item.kind === 'audio',
  );
  if (!q) return clips;
  const match = clips.find((it) => it.id === q || it.id.startsWith(q));
  return match ? [match] : { error: `no audio/video clip ${q}` };
}

export async function execSilenceTool(name: string, args: Args, ctx: AgentContext): Promise<unknown> {
  if (name !== 'remove_silence') return { error: `unknown tool ${name}` };
  if (!vadSilenceRemovalEnabled()) {
    return {
      ok: true,
      edited: [],
      note: 'VAD silence removal is disabled; skipping removal to avoid mistaking music, noise, or quiet speech for silence.',
    };
  }
  const params = {
    thresholdDb: typeof args.thresholdDb === 'number' ? args.thresholdDb : undefined,
    minSilenceMs: typeof args.minSilenceMs === 'number' ? args.minSilenceMs : undefined,
    padMs: typeof args.padMs === 'number' ? args.padMs : undefined,
  };
  const targets = targetItems(ctx, args.itemId);
  if ('error' in targets) return targets;
  const state = ctx.getState();
  const fps = state.fps;

  const skipped: Array<{ itemId: string; note: string }> = [];
  const edited: Array<{ itemId: string; removedSec: number; cuts: Array<{ fromSec: number; toSec: number }> }> = [];
  const allActions: Action[] = [];
  const spanCache = new Map<string, Promise<SilenceSpan[]>>();
  const assetsBySrc = new Map((ctx.getDoc().assets ?? [])
    .filter((asset) => !!asset.src)
    .map((asset) => [asset.src, asset]));
  /** Frames already removed from an earlier clip on the same track → shift subsequent clips left by this amount before planning them. */
  const trackShift = new Map<string, number>();

  const ordered = [...targets].sort((a, b) => a.track === b.track ? a.startFrame - b.startFrame : String(a.track).localeCompare(String(b.track)));
  for (const item of ordered) {
    const blocker = silenceRemovalBlocker(item);
    if (blocker) {
      skipped.push({ itemId: item.id, note: blocker });
      continue;
    }
    try {
      const asset = assetsBySrc.get(item.src!);
      const sourceRevision = sourceRevisionOf(asset ?? {
        src: item.src!,
        name: item.name,
        kind: item.kind,
        sourceRevision: item.sourceRevision,
        durationInFrames: item.durationInFrames,
      });
      const cacheKey = `${item.src!}:${sourceRevision}`;
      if (!spanCache.has(cacheKey)) {
        spanCache.set(cacheKey, analyzeClipSilence(item.src!, params, {
          assetId: asset?.id ?? item.id,
          sourceRevision,
          featureEnabled: true,
        }));
      }
      const spans = await spanCache.get(cacheKey)!;
      const cuts = spansToLocalCuts(item, spans, fps);
      if (!cuts.length) continue;
      const shifted = { ...item, startFrame: item.startFrame - (trackShift.get(item.track) ?? 0) };
      const plan = planSilenceRemoval(shifted, cuts, () => crypto.randomUUID());
      if (!plan.actions.length) continue;
      allActions.push(...plan.actions);
      trackShift.set(item.track, (trackShift.get(item.track) ?? 0) + plan.removedFrames);
      edited.push({
        itemId: item.id,
        removedSec: Math.round((plan.removedFrames / fps) * 100) / 100,
        cuts: plan.cuts.map((c) => ({
          fromSec: Math.round((c.fromFrame / fps) * 100) / 100,
          toSec: Math.round((c.toFrame / fps) * 100) / 100,
        })),
      });
    } catch (e) {
      skipped.push({ itemId: item.id, note: `analysis failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  if (args.dryRun === true) {
    return { ok: true, dryRun: true, wouldEdit: edited, ...(skipped.length ? { skipped } : {}) };
  }
  if (allActions.length) ctx.commands.batch(allActions, 'Remove silence');
  return {
    ok: true,
    edited,
    ...(skipped.length ? { skipped } : {}),
    ...(edited.length ? {} : { note: 'no removable dead air found (no silence long enough within the threshold)' }),
  };
}
