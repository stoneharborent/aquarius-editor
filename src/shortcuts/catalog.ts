// Default keyboard preset with 58 actions — the Final Cut Pro layout.
//
// `docs/fcp-shortcut-map.md` is the law: it lists every action here, the FCP command it
// mirrors, and the reason for each deviation. Change that table in the same commit as any
// binding you touch. Labels are English source strings localized through t() (see src/i18n).
//
// "Mod" is ⌘ on macOS and Ctrl everywhere else; "Alt" is ⌥ on macOS. Bindings that read as
// bare punctuation (",", "[", "]") are matched by physical key, so ⌥[ and ⇧, still resolve
// on macOS where those chords produce a different character (see match.ts).

export type ShortcutGroup =
  | 'edit'
  | 'markers'
  | 'navigation'
  | 'playback'
  | 'view';

export interface ShortcutAction {
  id: string;
  label: string;
  group: ShortcutGroup;
  /** Human-readable bindings such as "Mod + Alt + V / Mod + Shift + B". */
  keys: string;
  /** If true, ignore when focus is in input/textarea/contenteditable (default true). */
  disabledWhenTyping?: boolean;
}

export const SHORTCUT_GROUPS: { id: ShortcutGroup; label: string }[] = [
  { id: 'playback', label: 'Playback' },
  { id: 'edit', label: 'Edit' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'markers', label: 'Markers' },
  { id: 'view', label: 'View' },
];

/** Canonical 58 actions — source of truth for help UI + matcher. */
export const SHORTCUT_CATALOG: ShortcutAction[] = [
  { id: 'play-pause', label: 'Play / Pause', group: 'playback', keys: 'Space' },
  { id: 'seek-back', label: 'Previous frame', group: 'playback', keys: '←' },
  { id: 'seek-fwd', label: 'Next frame', group: 'playback', keys: '→' },
  { id: 'seek-back-sec', label: 'Step back 10 frames', group: 'playback', keys: 'Shift + ←' },
  { id: 'seek-fwd-sec', label: 'Step forward 10 frames', group: 'playback', keys: 'Shift + →' },
  { id: 'shuttle-back', label: 'Shuttle backward', group: 'playback', keys: 'J' },
  { id: 'shuttle-fwd', label: 'Shuttle forward', group: 'playback', keys: 'L' },
  { id: 'shuttle-pause', label: 'Shuttle pause', group: 'playback', keys: 'K' },
  { id: 'shuttle-jog-back', label: 'Jog back one frame', group: 'playback', keys: 'K + J' },
  { id: 'shuttle-jog-fwd', label: 'Jog forward one frame', group: 'playback', keys: 'K + L' },

  { id: 'undo', label: 'Undo', group: 'edit', keys: 'Mod + Z' },
  { id: 'redo', label: 'Redo', group: 'edit', keys: 'Mod + Shift + Z / Mod + Y' },
  { id: 'copy', label: 'Copy', group: 'edit', keys: 'Mod + C' },
  { id: 'cut', label: 'Cut', group: 'edit', keys: 'Mod + X' },
  { id: 'paste', label: 'Paste', group: 'edit', keys: 'Mod + V' },
  { id: 'paste-effects', label: 'Paste Effects', group: 'edit', keys: 'Mod + Alt + V / Mod + Shift + V' },
  { id: 'duplicate', label: 'Duplicate', group: 'edit', keys: 'Mod + D' },
  { id: 'delete', label: 'Delete', group: 'edit', keys: 'Backspace / Delete / Shift + Backspace / Shift + Delete' },
  { id: 'split', label: 'Split', group: 'edit', keys: 'Mod + B' },
  { id: 'interaction-mode-selection', label: 'Selection Mode', group: 'edit', keys: 'A' },
  { id: 'interaction-mode-trim', label: 'Trim Edit Mode', group: 'edit', keys: 'T' },
  { id: 'interaction-mode-slip', label: 'Slip Edit Mode', group: 'edit', keys: 'U' },
  { id: 'interaction-mode-blade', label: 'Blade Edit Mode', group: 'edit', keys: 'B' },
  { id: 'interaction-mode-pen', label: 'Pen Edit Mode', group: 'edit', keys: 'P' },
  { id: 'nudge-left', label: 'Nudge left 1 / 10 frames', group: 'edit', keys: ', / Shift + ,' },
  { id: 'nudge-right', label: 'Nudge right 1 / 10 frames', group: 'edit', keys: '. / Shift + .' },
  { id: 'trim-start', label: 'Trim start', group: 'edit', keys: 'Alt + [' },
  { id: 'trim-end', label: 'Trim end', group: 'edit', keys: 'Alt + ]' },
  // disabled when typing so ⌘A still selects text in chat/inspector inputs
  // The three Final Cut edit keys, acting on the card selected in the Library
  // (see src/library/librarySelection.ts). They were held free for exactly this
  // in docs/fcp-shortcut-map.md.
  { id: 'library-append', label: 'Append selected library item', group: 'edit', keys: 'E' },
  { id: 'library-insert', label: 'Insert selected library item at playhead', group: 'edit', keys: 'W' },
  { id: 'library-connect', label: 'Connect selected library item at playhead', group: 'edit', keys: 'Q' },
  { id: 'select-all', label: 'Select all', group: 'edit', keys: 'Mod + A' },
  { id: 'select-after', label: 'Select clips forward', group: 'edit', keys: 'Y' },
  { id: 'move-up', label: 'Move clip up', group: 'edit', keys: 'Alt + ↑' },
  { id: 'move-down', label: 'Move clip down', group: 'edit', keys: 'Alt + ↓' },
  { id: 'move-left-boundary', label: 'Move left to boundary', group: 'edit', keys: 'Ctrl + E' },
  { id: 'move-right-boundary', label: 'Move right to boundary', group: 'edit', keys: 'Ctrl + R' },
  { id: 'save-version', label: 'Save version', group: 'edit', keys: 'Mod + S' },

  { id: 'prev-edit', label: 'Previous edit', group: 'navigation', keys: '↑' },
  { id: 'next-edit', label: 'Next edit', group: 'navigation', keys: '↓' },
  { id: 'zone-in', label: 'Mark in', group: 'navigation', keys: 'I' },
  { id: 'zone-out', label: 'Mark out', group: 'navigation', keys: 'O' },
  { id: 'zone-clear', label: 'Clear marks', group: 'navigation', keys: 'Alt + X' },
  { id: 'zone-clip', label: 'Mark clip at playhead', group: 'navigation', keys: 'X' },
  // No FCP command and no free key worth spending — reachable from the agent + menus.
  { id: 'zone-selection', label: 'Mark selection', group: 'navigation', keys: '' },

  { id: 'marker-add', label: 'Add marker', group: 'markers', keys: 'M' },
  { id: 'marker-shortcut-add-and-open', label: 'Add marker and open dialog', group: 'markers', keys: 'Alt + M' },
  { id: 'marker-modify-at-playhead', label: 'Modify marker at playhead', group: 'markers', keys: 'Shift + M' },
  { id: 'marker-delete-at-playhead', label: 'Delete marker at playhead', group: 'markers', keys: 'Ctrl + M' },
  { id: 'marker-prev', label: 'Previous marker', group: 'markers', keys: 'Ctrl + ;' },
  { id: 'marker-next', label: 'Next marker', group: 'markers', keys: "Ctrl + '" },

  { id: 'snapping', label: 'Snapping', group: 'view', keys: 'N' },
  { id: 'selection-mode', label: 'Selection mode', group: 'view', keys: 'Alt + S' },
  { id: 'zoom-in', label: 'Timeline zoom in', group: 'view', keys: 'Mod + = / Mod + Shift + =' },
  { id: 'zoom-out', label: 'Timeline zoom out', group: 'view', keys: 'Mod + -' },
  { id: 'zoom-fit', label: 'Zoom timeline to fit', group: 'view', keys: 'Shift + Z' },
  { id: 'fullscreen', label: 'Fullscreen preview', group: 'view', keys: 'Mod + Shift + F / `' },
  { id: 'keyboard-shortcuts', label: 'Keyboard shortcuts', group: 'view', keys: 'Mod + Alt + K', disabledWhenTyping: false },

];

export const SHORTCUT_BY_ID = Object.fromEntries(
  SHORTCUT_CATALOG.map((a) => [a.id, a]),
) as Record<string, ShortcutAction>;
