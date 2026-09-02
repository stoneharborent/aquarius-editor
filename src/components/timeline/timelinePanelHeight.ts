// How tall the timeline panel wants to be, published by the timeline itself and
// read by the editor's panel layout one level up.
//
// The timeline is the only place that knows its row heights (track count ×
// Alt+wheel track scale), and the grid row that holds it is sized by
// useEditorPanelLayout, which sits above it in the tree. A tiny store keeps that
// one number flowing upwards without threading it through every workspace prop
// bag, and without a ResizeObserver: the value changes only when React already
// re-rendered the timeline for a new track count or track scale.
import { useEffect, useSyncExternalStore } from 'react';

let contentHeight: number | null = null;
let chromeHeight = 0;
let snapshot: number | null = null;
const listeners = new Set<() => void>();

function recompute(): void {
  const next = contentHeight === null ? null : contentHeight + chromeHeight;
  if (next === snapshot) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

/** The timeline's own content-fit height, or null while no timeline is mounted. */
export function publishTimelineContentHeight(height: number | null): void {
  contentHeight = height === null || !Number.isFinite(height) ? null : Math.max(0, height);
  recompute();
}

/** Extra chrome sharing the timeline's grid row (the sequence tab bar). */
export function publishTimelineChromeHeight(height: number): void {
  chromeHeight = Number.isFinite(height) ? Math.max(0, height) : 0;
  recompute();
}

export function subscribeTimelinePanelHeight(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getTimelinePanelHeight(): number | null {
  return snapshot;
}

/** Reset hook for verifies and for teardown between editor sessions. */
export function resetTimelinePanelHeight(): void {
  contentHeight = null;
  chromeHeight = 0;
  recompute();
}

/** null on the server and until the timeline has published — layout falls back to the stored ratio. */
export function useTimelinePanelHeight(): number | null {
  return useSyncExternalStore(subscribeTimelinePanelHeight, getTimelinePanelHeight, () => null);
}

export function usePublishTimelineContentHeight(height: number): void {
  useEffect(() => { publishTimelineContentHeight(height); }, [height]);
  useEffect(() => () => publishTimelineContentHeight(null), []);
}

export function usePublishTimelineChromeHeight(height: number): void {
  useEffect(() => { publishTimelineChromeHeight(height); }, [height]);
  useEffect(() => () => publishTimelineChromeHeight(0), []);
}
