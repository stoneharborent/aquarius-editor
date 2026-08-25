export { REFRAME_TOOL_SCHEMAS, REFRAME_TOOL_NAMES } from './schemas/reframe-tools';
import type { AgentContext } from '../context';
import type { TimelineItem, TimelineState } from '../../editor/types';
import {
  DEFAULT_REFRAME_SMOOTH,
  detectFocalPoints,
  magnificationForAspect,
} from '../../reframe/detect';
import { focalFramesFromGeometry } from '../../reframe/geometry-focus';
import { analyzeAssetGeometry } from '../../geometry/visual-geometry';

// auto_reframe — Custom tool.
// reframe originally only had the "write/render" infrastructure (builtin:zoom + reserved
// __openchatcutReframeCurve = ReframeCurveV1); there was no "sample video → detect subject →
// auto-generate keyframes" agent tool. This tool wires the heuristic detection in
// src/reframe/detect.ts up to EditorCore: sample the target video → detect the focal point
// every intervalFrames → write setReframeKeyframe frame by frame, so a crop window like
// 16:9→9:16 follows the subject. Pixel sampling only runs in the browser (fails gracefully
// when headless).

type Args = Record<string, unknown>;

/** Resolve the target clip by prefix match (same semantics as findItem in tools.ts/effect-tools.ts) */
function findItem(items: TimelineItem[], id: unknown): TimelineItem | null {
  const q = String(id ?? '');
  if (!q) return null;
  return items.find((it) => it.id === q || it.id.startsWith(q)) ?? null;
}

/** Create an off-screen <video> from the media src, wait for metadata to be ready (to get videoWidth/Height), with a timeout */
function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.crossOrigin = 'anonymous'; // no effect for same-origin /media/uploads; avoids tainting read pixels for cross-origin sources
    video.preload = 'auto';
    const cleanup = (): void => {
      video.removeEventListener('loadedmetadata', onOk);
      video.removeEventListener('error', onErr);
    };
    const onOk = (): void => {
      cleanup();
      resolve(video);
    };
    const onErr = (): void => {
      cleanup();
      reject(new Error(`auto_reframe: video failed to load (${src})`));
    };
    video.addEventListener('loadedmetadata', onOk, { once: true });
    video.addEventListener('error', onErr, { once: true });
    video.src = src;
    setTimeout(() => {
      if (video.readyState >= 1) onOk();
      else onErr();
    }, 8000);
  });
}

/** Clear all existing reframe keyframes for this clip (auto reframe replaces entirely rather than layering)*/
function clearReframe(ctx: AgentContext, item: TimelineItem): void {
  const kfs = item.zoom?.reframeCurve?.keyframes ?? [];
  for (const k of kfs) ctx.commands.removeReframeKeyframe(item.id, k.frame);
}

export async function execReframeTool(name: string, args: Args, ctx: AgentContext): Promise<unknown> {
  if (name !== 'auto_reframe') return { error: `unknown tool ${name}` };

  // —— Environment guard: pixel sampling requires a browser ——
  if (typeof document === 'undefined' || typeof HTMLVideoElement === 'undefined') {
    return { error: 'auto_reframe needs a browser environment (video pixel sampling); no DOM is available here, so it cannot run.' };
  }

  const state: TimelineState = ctx.getState();
  const videos = state.items.filter((it) => it.kind === 'video');
  const item = findItem(videos, args.itemId);
  if (!item) {
    return { error: `no video clip ${args.itemId ?? '(missing itemId)'}`, available: videos.map((v) => ({ itemId: v.id, name: v.name })) };
  }
  if (!item.src) return { error: `clip ${item.id} has no sampleable video source (src is missing)` };

  // —— Parameter cleanup ——
  const intervalFrames = Number.isFinite(Number(args.intervalFrames)) ? Math.max(1, Math.floor(Number(args.intervalFrames))) : undefined;
  const sensitivity = Number.isFinite(Number(args.sensitivity)) ? Math.max(0, Math.min(1, Number(args.sensitivity))) : undefined;
  const smooth = Number.isFinite(Number(args.smooth)) ? Math.max(0, Math.min(1, Number(args.smooth))) : undefined;
  const maxSamples = Number.isFinite(Number(args.maxSamples)) ? Math.max(4, Math.floor(Number(args.maxSamples))) : undefined;
  const dstAspect = state.height > 0 ? state.width / state.height : 16 / 9;

  // Same aspect as source → reframe is a no-op (magnification ≈ 1); still write center keyframes so UI shows a curve.
  try {
    const video = await loadVideo(item.src);
    const srcWidth = video.videoWidth || item.width || undefined;
    const srcHeight = video.videoHeight || item.height || undefined;

    // Geometry-first: when the visual-geometry cache (person/face segments) is
    // available, focal points come from subject centers — no pixel sampling,
    // robust on complex backgrounds. Falls back to the energy-grid heuristic.
    const asset = item.src ? ctx.getDoc().assets.find((candidate) => candidate.src === item.src) : undefined;
    const geometryResult = asset
      ? await analyzeAssetGeometry(asset, undefined, { maxSamples })
      : undefined;
    const geometry = geometryResult?.geometry;
    const usedGeometry = Boolean(geometry && geometry.segments.some((segment) => segment.zone.subject || segment.zone.face));
    const magnification = magnificationForAspect(srcWidth ?? 0, srcHeight ?? 0, dstAspect);

    const keyframes = usedGeometry
      ? focalFramesFromGeometry(geometry!, item.durationInFrames, state.fps, {
        srcInFrame: item.srcInFrame ?? 0,
        playbackRate: item.playbackRate,
        intervalFrames,
        maxSamples,
        smooth,
        magnification,
      })
      : await detectFocalPoints(video, {
        durationInFrames: item.durationInFrames,
        fps: state.fps,
        dstAspect,
        srcInFrame: item.srcInFrame ?? 0,
        playbackRate: item.playbackRate,
        intervalFrames,
        sensitivity,
        smooth,
        maxSamples,
        srcWidth,
        srcHeight,
      });

    if (!keyframes.length) {
      return { error: `auto_reframe: could not sample any frames from clip ${item.id} (the video may not be readable)`, keyframes: 0 };
    }

    clearReframe(ctx, item);
    for (const k of keyframes) ctx.commands.setReframeKeyframe(item.id, k.frame, k.focalPointX, k.focalPointY, k.magnification);

    return {
      ok: true,
      itemId: item.id,
      keyframes: keyframes.length,
      magnification,
      dstAspect: Number(dstAspect.toFixed(4)),
      smooth: smooth ?? DEFAULT_REFRAME_SMOOTH,
      source: usedGeometry ? 'geometry' : 'energy-grid',
      note: usedGeometry
        ? 'Focal points generated from person/face geometry (no pixel sampling needed).'
        : magnification <= 1.05
          ? 'Canvas aspect is close to the source, so the crop magnification is ≈1; keyframes were written and will show more clearly once the canvas is switched to portrait.'
          : 'Reframe keyframes were written; use view_timeline_frames to check the crop is tracking the subject.',
    };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'auto_reframe failed' };
  }
}
