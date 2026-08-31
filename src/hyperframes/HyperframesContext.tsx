// One owner for HyperFrames in the editor, shared by the Library tab and the
// timeline popup so both see the same generations and the same in-flight runs.
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  useSyncExternalStore, type ReactNode,
} from 'react';
import type { MediaAsset, TrackId } from '../editor/types';
import { fetchHyperframesConfig, generateHyperframe, type HyperframesConfigStatus } from './api';
import {
  hyperframeAsset, hyperframeNameFromPrompt, hyperframeRecords,
  type HyperframeRecord, type PendingHyperframe,
} from './records';
import {
  deliverHyperframeRun, dropHyperframeRun, drainHyperframeInbox, failHyperframeRun,
  hyperframesRuns, startHyperframeRun, subscribeHyperframesRuns,
} from './store';

export interface HyperframesPlacement {
  readonly track: TrackId;
  readonly startFrame: number;
}

export interface HyperframesHost {
  readonly projectId: string;
  readonly timelineId: string;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly assets: readonly MediaAsset[];
  readonly addAsset: (asset: MediaAsset) => void;
  readonly placeAsset: (asset: MediaAsset, at: { track?: TrackId; startFrame?: number }) => void;
  readonly renameAsset: (id: string, name: string) => void;
  readonly removeAsset: (id: string) => void;
  readonly getPlayhead: () => number;
}

export interface HyperframesApi {
  readonly records: HyperframeRecord[];
  readonly pending: readonly PendingHyperframe[];
  readonly config: HyperframesConfigStatus | null;
  readonly fps: number;
  readonly generate: (prompt: string, placement?: HyperframesPlacement) => void;
  readonly regenerate: (record: HyperframeRecord) => void;
  readonly retry: (run: PendingHyperframe) => void;
  readonly dismiss: (runId: string) => void;
  readonly rename: (record: HyperframeRecord, name: string) => void;
  readonly remove: (record: HyperframeRecord) => void;
  readonly insertAtPlayhead: (record: HyperframeRecord) => void;
  readonly refreshConfig: () => void;
}

/** Exported so a static render can supply a fixed API without a live host. */
export const HyperframesContext = createContext<HyperframesApi | null>(null);

const newRunId = (): string => (
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `hf_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
);

/** Default clip length for a generated graphic when the model does not shorten it. */
export const HYPERFRAMES_DEFAULT_SECONDS = 5;

export function HyperframesProvider({ host, children }: { host: HyperframesHost; children: ReactNode }) {
  const { projectId } = host;
  const hostRef = useRef(host);
  hostRef.current = host;

  const runs = useSyncExternalStore(
    useCallback((listener) => subscribeHyperframesRuns(projectId, listener), [projectId]),
    useCallback(() => hyperframesRuns(projectId), [projectId]),
    useCallback(() => hyperframesRuns(projectId), [projectId]),
  );

  const [config, setConfig] = useConfigStatus();

  // Commit anything a previous mount left behind, then anything that finishes now.
  useEffect(() => {
    const deliveries = drainHyperframeInbox(projectId);
    if (!deliveries.length) return;
    const current = hostRef.current;
    for (const delivery of deliveries) {
      current.addAsset(delivery.asset);
      if (delivery.placement && delivery.placement.timelineId === current.timelineId) {
        current.placeAsset(delivery.asset, {
          track: delivery.placement.track as TrackId,
          startFrame: delivery.placement.startFrame,
        });
      }
    }
  }, [projectId, runs.inbox]);

  const run = useCallback((prompt: string, placement?: HyperframesPlacement) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const current = hostRef.current;
    const runId = newRunId();
    const createdAt = Date.now();
    startHyperframeRun(projectId, {
      id: runId,
      prompt: trimmed,
      createdAt,
      status: 'running',
      ...(placement ? { placement: { track: placement.track, startFrame: placement.startFrame } } : {}),
    });
    const durationInFrames = Math.round(current.fps * HYPERFRAMES_DEFAULT_SECONDS);
    const timelineId = current.timelineId;
    void generateHyperframe({
      prompt: trimmed,
      width: current.width,
      height: current.height,
      fps: current.fps,
      durationInFrames,
    }).then((result) => {
      if (!result.configured) {
        // Carry the server's reason through so the setup card that reappears
        // can say WHY — a deleted weight file is not the same as a fresh
        // install, and neither should look like a button that silently did
        // nothing.
        setConfig({
          configured: false,
          provider: '',
          providerLabel: '',
          model: '',
          builtin: false,
          ...(result.problem ? { problem: result.problem } : {}),
        });
        failHyperframeRun(projectId, runId, 'No language model is configured yet.');
        return;
      }
      if (!result.ok || !result.code) {
        failHyperframeRun(projectId, runId, result.error || 'Generation failed');
        return;
      }
      deliverHyperframeRun(projectId, {
        runId,
        asset: hyperframeAsset({
          id: newRunId(),
          prompt: trimmed,
          code: result.code,
          width: result.width ?? current.width,
          height: result.height ?? current.height,
          durationInFrames: result.durationInFrames ?? durationInFrames,
          createdAt,
          name: hyperframeNameFromPrompt(trimmed),
        }),
        ...(placement
          ? { placement: { track: placement.track, startFrame: placement.startFrame, timelineId } }
          : {}),
      });
    }, (error: unknown) => {
      failHyperframeRun(projectId, runId, error instanceof Error ? error.message : String(error));
    });
  }, [projectId, setConfig]);

  const records = useMemo(() => hyperframeRecords(host.assets), [host.assets]);

  const api = useMemo<HyperframesApi>(() => ({
    records,
    pending: runs.pending,
    config,
    fps: host.fps,
    generate: run,
    regenerate: (record) => run(record.prompt),
    retry: (failed) => {
      dropHyperframeRun(projectId, failed.id);
      run(failed.prompt, failed.placement
        ? { track: failed.placement.track as TrackId, startFrame: failed.placement.startFrame }
        : undefined);
    },
    dismiss: (runId) => dropHyperframeRun(projectId, runId),
    rename: (record, name) => {
      const trimmed = name.trim();
      if (trimmed && trimmed !== record.name) hostRef.current.renameAsset(record.id, trimmed);
    },
    remove: (record) => hostRef.current.removeAsset(record.id),
    insertAtPlayhead: (record) => hostRef.current.placeAsset(record.asset, {
      startFrame: hostRef.current.getPlayhead(),
    }),
    refreshConfig: () => { void fetchHyperframesConfig().then(setConfig); },
  }), [config, host.fps, projectId, records, run, runs.pending, setConfig]);

  return <HyperframesContext.Provider value={api}>{children}</HyperframesContext.Provider>;
}

/** Provider status, loaded once per mount and re-read after the setup card saves. */
function useConfigStatus(): [
  HyperframesConfigStatus | null,
  (next: HyperframesConfigStatus) => void,
] {
  const [status, setStatus] = useState<HyperframesConfigStatus | null>(null);
  const set = useCallback((next: HyperframesConfigStatus) => setStatus(next), []);
  useEffect(() => {
    let alive = true;
    void fetchHyperframesConfig().then((next) => { if (alive) setStatus(next); });
    return () => { alive = false; };
  }, []);
  return [status, set];
}

/** Editor-only: every consumer sits inside the workspace provider. */
export function useHyperframes(): HyperframesApi {
  const api = useContext(HyperframesContext);
  if (!api) throw new Error('useHyperframes must be used inside HyperframesProvider');
  return api;
}

/** Consumers that render outside the provider (never in the editor) get null. */
export function useOptionalHyperframes(): HyperframesApi | null {
  return useContext(HyperframesContext);
}
