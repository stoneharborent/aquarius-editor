export type AssetDestination = 'timeline';

export interface AssetDestinationActions {
  timeline: () => void;
}

export function runAssetDestinationAction(
  destination: AssetDestination,
  actions: AssetDestinationActions,
): void {
  actions[destination]();
}
