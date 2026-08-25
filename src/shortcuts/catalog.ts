// Default keyboard preset with 56 actions. Labels are English source strings and are
// localized through t() (see src/i18n).

export type ShortcutGroup =
  | 'ai'
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
  { id: 'ai', label: 'AI' },
];

/** Canonical 56 actions — source of truth for help UI + matcher. */
export const SHORTCUT_CATALOG: ShortcutAction[] = [
  { id: 'play-pause', label: 'Play / Pause', group: 'playback', keys: 'Space' },
  { id: 'seek-back', label: 'Previous frame', group: 'playback', keys: '←' },
  { id: 'seek-fwd', label: 'Next frame', group: 'playback', keys: '→' },
  { id: 'seek-back-sec', label: 'Step back 1 second', group: 'playback', keys: 'Shift + ←' },
  { id: 'seek-fwd-sec', label: 'Step forward 1 second', group: 'playback', keys: 'Shift + →' },
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
  { id: 'paste-effects', label: 'Paste Effects', group: 'edit', keys: 'Mod + Alt + V / Mod + Shift + B' },
  { id: 'duplicate', label: 'Duplicate', group: 'edit', keys: 'Mod + D' },
  { id: 'delete', label: 'Delete', group: 'edit', keys: 'Backspace / Delete' },
  { id: 'split', label: 'Split', group: 'edit', keys: 'C / Enter' },
  { id: 'interaction-mode-selection', label: 'Selection Mode', group: 'edit', keys: 'V' },
  { id: 'interaction-mode-trim', label: 'Trim Edit Mode', group: 'edit', keys: 'N' },
  { id: 'interaction-mode-slip', label: 'Slip Edit Mode', group: 'edit', keys: 'U' },
  { id: 'interaction-mode-blade', label: 'Blade Edit Mode', group: 'edit', keys: 'B' },
  { id: 'interaction-mode-pen', label: 'Pen Edit Mode', group: 'edit', keys: 'P' },
  { id: 'nudge-left', label: 'Nudge left 1 / 5 frames', group: 'edit', keys: 'E / Shift + E' },
  { id: 'nudge-right', label: 'Nudge right 1 / 5 frames', group: 'edit', keys: 'R / Shift + R' },
  { id: 'trim-start', label: 'Trim start', group: 'edit', keys: 'Q' },
  { id: 'trim-end', label: 'Trim end', group: 'edit', keys: 'W' },
  // disabled when typing so ⌘A still selects text in chat/inspector inputs
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
  { id: 'zone-clear', label: 'Clear marks', group: 'navigation', keys: 'X' },
  { id: 'zone-clip', label: 'Mark clip at playhead', group: 'navigation', keys: '/' },
  { id: 'zone-selection', label: 'Mark selection', group: 'navigation', keys: '' },

  { id: 'marker-add', label: 'Add marker', group: 'markers', keys: 'M' },
  { id: 'marker-shortcut-add-and-open', label: 'Add marker and open dialog', group: 'markers', keys: 'Mod + M' },
  { id: 'marker-modify-at-playhead', label: 'Modify marker at playhead', group: 'markers', keys: 'Shift + M' },
  { id: 'marker-delete-at-playhead', label: 'Delete marker at playhead', group: 'markers', keys: 'Alt + M' },
  { id: 'marker-prev', label: 'Previous marker', group: 'markers', keys: 'Shift + ↑' },
  { id: 'marker-next', label: 'Next marker', group: 'markers', keys: 'Shift + ↓' },

  { id: 'snapping', label: 'Snapping', group: 'view', keys: 'S' },
  { id: 'selection-mode', label: 'Selection mode', group: 'view', keys: 'Alt + S' },
  { id: 'zoom-in', label: 'Timeline zoom in', group: 'view', keys: 'Mod + = / Mod + +' },
  { id: 'zoom-out', label: 'Timeline zoom out', group: 'view', keys: 'Mod + -' },
  { id: 'zoom-fit', label: 'Zoom timeline to fit', group: 'view', keys: 'Shift + Z' },
  { id: 'fullscreen', label: 'Fullscreen preview', group: 'view', keys: '`' },
  { id: 'keyboard-shortcuts', label: 'Keyboard shortcuts', group: 'view', keys: 'Mod + Alt + K', disabledWhenTyping: false },

  { id: 'ask-ai', label: 'Add to AI chat', group: 'ai', keys: 'Tab' },
];

export const SHORTCUT_BY_ID = Object.fromEntries(
  SHORTCUT_CATALOG.map((a) => [a.id, a]),
) as Record<string, ShortcutAction>;
