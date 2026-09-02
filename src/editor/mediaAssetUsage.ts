import { maintainLinkGroups } from './linkGroups.js';
import { reconcileTimelineCaptionReferences } from '../captions/reconcileSources.js';
import type { MediaAsset, ProjectDoc, Timeline, TimelineItem } from './types.js';

/** Resolve a timeline clip to one pool master without guessing across duplicate sources. */
export function timelineItemAssetId(
  item: TimelineItem,
  assets: readonly MediaAsset[],
): string | undefined {
  if (item.sourceAssetId && assets.some((asset) => asset.id === item.sourceAssetId)) {
    return item.sourceAssetId;
  }
  if (item.kind === 'motion-graphic'
    && item.templateId
    && assets.some((asset) => asset.id === item.templateId)) {
    return item.templateId;
  }
  if (!item.src) return undefined;
  const sameSource = assets.filter((asset) => asset.src === item.src);
  if (sameSource.length === 1) return sameSource[0]!.id;
  const sameName = sameSource.filter((asset) => asset.name === item.name);
  return sameName.length === 1 ? sameName[0]!.id : undefined;
}

export function timelineItemUsesAsset(
  item: TimelineItem,
  asset: MediaAsset,
  assets: readonly MediaAsset[],
): boolean {
  return timelineItemAssetId(item, assets) === asset.id;
}

/**
 * How many timeline clips are made from each pool asset, counted across EVERY
 * timeline in the project (plus multicam angle sources, which are clips too).
 *
 * An asset with no entry here is used by nothing, anywhere: removing it cannot
 * shorten an edit. Callers that only need the yes/no answer use
 * `usedMediaAssetIds`, which is this map's key set — one traversal, so the two
 * can never disagree about whether an asset is in use.
 */
export function mediaAssetClipCounts(
  doc: Pick<ProjectDoc, 'assets' | 'timelines'>,
): Map<string, number> {
  const counts = new Map<string, number>();
  const tally = (item: TimelineItem): void => {
    const assetId = timelineItemAssetId(item, doc.assets);
    if (assetId) counts.set(assetId, (counts.get(assetId) ?? 0) + 1);
  };
  for (const timeline of doc.timelines) {
    for (const item of timeline.items) tally(item);
    for (const group of timeline.multicamGroups ?? []) {
      for (const angle of group.angles) tally(angle.source);
    }
  }
  return counts;
}

export function usedMediaAssetIds(
  doc: Pick<ProjectDoc, 'assets' | 'timelines'>,
): Set<string> {
  return new Set(mediaAssetClipCounts(doc).keys());
}

export function mapTimelineAssetItems(
  timeline: Timeline,
  asset: MediaAsset,
  assets: readonly MediaAsset[],
  map: (item: TimelineItem) => TimelineItem,
): Timeline {
  let changed = false;
  const mapOne = (item: TimelineItem): TimelineItem => {
    if (!timelineItemUsesAsset(item, asset, assets)) return item;
    const next = map(item);
    if (next !== item) changed = true;
    return next;
  };
  const items = timeline.items.map(mapOne);
  const multicamGroups = timeline.multicamGroups?.map((group) => {
    const angles = group.angles.map((angle) => {
      const source = mapOne(angle.source);
      return source === angle.source ? angle : { ...angle, source };
    });
    return angles.every((angle, index) => angle === group.angles[index]) ? group : { ...group, angles };
  });
  return changed ? { ...timeline, items, multicamGroups } : timeline;
}

export function removeAssetFromTimeline(
  timeline: Timeline,
  asset: MediaAsset,
  assets: readonly MediaAsset[],
): Timeline {
  const removedIds = new Set(timeline.items
    .filter((item) => timelineItemUsesAsset(item, asset, assets))
    .map((item) => item.id));
  let removedMulticamAngle = false;
  const collapsedMulticamGroupIds = new Set<string>();
  const multicamGroups = timeline.multicamGroups?.flatMap((group) => {
    const angles = group.angles.filter((angle) => (
      !removedIds.has(angle.itemId)
      && !timelineItemUsesAsset(angle.source, asset, assets)
    ));
    if (angles.length !== group.angles.length) removedMulticamAngle = true;
    if (angles.length === group.angles.length) return [group];
    if (angles.length < 2) {
      collapsedMulticamGroupIds.add(group.id);
      return [];
    }
    const angleIds = new Set(angles.map((angle) => angle.id));
    const firstAngleId = angles[0]!.id;
    return [{
      ...group,
      angles,
      referenceAngleId: angleIds.has(group.referenceAngleId) ? group.referenceAngleId : firstAngleId,
      masterAngleId: angleIds.has(group.masterAngleId) ? group.masterAngleId : firstAngleId,
      evidence: group.evidence.filter((entry) => angleIds.has(entry.angleId)),
      decisions: group.decisions?.filter((entry) => angleIds.has(entry.angleId)),
    }];
  });
  if (removedIds.size === 0 && !removedMulticamAngle) return timeline;
  const items = timeline.items.flatMap((item) => {
    if (removedIds.has(item.id)) return [];
    if (!item.multicamGroupId || !collapsedMulticamGroupIds.has(item.multicamGroupId)) return [item];
    const next = { ...item };
    delete next.multicamGroupId;
    delete next.multicamAngleId;
    return [next];
  });
  const remainingIds = new Set(items.map((item) => item.id));
  const selectedIds = (timeline.selectedIds ?? (timeline.selectedId ? [timeline.selectedId] : []))
    .filter((id) => remainingIds.has(id));
  return reconcileTimelineCaptionReferences({
    ...timeline,
    items,
    transitions: timeline.transitions?.filter((transition) => (
      !removedIds.has(transition.incomingItemId)
      && !removedIds.has(transition.outgoingItemId)
    )),
    linkGroups: maintainLinkGroups(timeline.linkGroups, remainingIds),
    multicamGroups: multicamGroups?.length ? multicamGroups : undefined,
    selectedIds,
    selectedId: selectedIds[selectedIds.length - 1] ?? null,
  });
}
