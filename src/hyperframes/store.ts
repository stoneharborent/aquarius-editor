// In-flight HyperFrames runs, held per project OUTSIDE React.
//
// A generation is a long round trip to a language model. If the user leaves the
// editor while one is running, the run must not be cancelled and its result must
// not be lost — the brief says the generation still has to land in the tab. So
// runs live in this module-level registry: the editor subscribes while mounted,
// and a finished composition parks in the project's inbox until an editor for
// that project is mounted to commit it to the media pool. Timeline placement is
// best effort on top of that: it is only attempted when the run's timeline is
// still the open one.
import type { MediaAsset } from '../editor/types';
import type { PendingHyperframe } from './records';

export interface HyperframesDelivery {
  readonly runId: string;
  readonly asset: MediaAsset;
  readonly placement?: { readonly track: string; readonly startFrame: number; readonly timelineId: string };
}

interface ProjectRuns {
  pending: PendingHyperframe[];
  inbox: HyperframesDelivery[];
}

const EMPTY: ProjectRuns = { pending: [], inbox: [] };
const registry = new Map<string, ProjectRuns>();
const listeners = new Map<string, Set<() => void>>();

function emit(projectId: string): void {
  for (const listener of listeners.get(projectId) ?? []) listener();
}

function mutate(projectId: string, update: (current: ProjectRuns) => ProjectRuns): void {
  registry.set(projectId, update(registry.get(projectId) ?? EMPTY));
  emit(projectId);
}

export function hyperframesRuns(projectId: string): ProjectRuns {
  return registry.get(projectId) ?? EMPTY;
}

export function subscribeHyperframesRuns(projectId: string, listener: () => void): () => void {
  const set = listeners.get(projectId) ?? new Set<() => void>();
  set.add(listener);
  listeners.set(projectId, set);
  return () => {
    set.delete(listener);
    if (!set.size) listeners.delete(projectId);
  };
}

export function startHyperframeRun(projectId: string, run: PendingHyperframe): void {
  mutate(projectId, (current) => ({ ...current, pending: [run, ...current.pending] }));
}

export function failHyperframeRun(projectId: string, runId: string, error: string): void {
  mutate(projectId, (current) => ({
    ...current,
    pending: current.pending.map((run) => (
      run.id === runId ? { ...run, status: 'failed' as const, error } : run
    )),
  }));
}

export function dropHyperframeRun(projectId: string, runId: string): void {
  mutate(projectId, (current) => ({
    ...current,
    pending: current.pending.filter((run) => run.id !== runId),
  }));
}

/** A finished composition: leave the pending card up until the pool commit lands. */
export function deliverHyperframeRun(projectId: string, delivery: HyperframesDelivery): void {
  mutate(projectId, (current) => ({ ...current, inbox: [...current.inbox, delivery] }));
}

/** Take everything waiting for the pool. Callers must commit what they take. */
export function drainHyperframeInbox(projectId: string): HyperframesDelivery[] {
  const current = registry.get(projectId);
  if (!current?.inbox.length) return [];
  const taken = current.inbox;
  registry.set(projectId, {
    inbox: [],
    pending: current.pending.filter((run) => !taken.some((delivery) => delivery.runId === run.id)),
  });
  emit(projectId);
  return taken;
}

/** Test seam: forget everything (the registry outlives React by design). */
export function resetHyperframesRuns(): void {
  registry.clear();
  listeners.clear();
}
