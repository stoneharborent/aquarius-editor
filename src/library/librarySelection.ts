// The one library item the keyboard is pointed at.
//
// Clicking a card in a Library tab SELECTS it and nothing else — it never puts
// a clip on the timeline by itself (Royce, 2026-09-02: "clicking on a generated
// image should not send it to the timeline"). Placing is a deliberate second
// gesture: drag the card onto a track, or press one of the Final Cut edit keys
// (E append / W insert / Q connect), which act on whatever is selected here.
//
// Only the pool-asset ID is stored, never the asset itself: the editor document
// is the source of truth, so a graphic that is renamed, revised or deleted
// between the click and the keypress can never be placed from a stale copy.
// Anything that lives in the media pool can be the selected item — this module
// knows nothing about Hyperframes.

import { useSyncExternalStore } from 'react';

let selectedId: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Point the edit keys at a pool asset, or pass null to point them at nothing. */
export function selectLibraryItem(assetId: string | null): void {
  const next = assetId ?? null;
  if (next === selectedId) return;
  selectedId = next;
  emit();
}

/** Forget the selection, but only if it is still the given item. */
export function clearLibraryItem(assetId: string): void {
  if (selectedId === assetId) selectLibraryItem(null);
}

export function selectedLibraryItemId(): string | null {
  return selectedId;
}

export function subscribeLibrarySelection(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** React view of the selection, for cards that draw themselves as selected. */
export function useSelectedLibraryItemId(): string | null {
  return useSyncExternalStore(
    subscribeLibrarySelection,
    selectedLibraryItemId,
    selectedLibraryItemId,
  );
}

/** Test-only: put the module back to its start-of-session state. */
export function resetLibrarySelection(): void {
  selectedId = null;
  listeners.clear();
}
