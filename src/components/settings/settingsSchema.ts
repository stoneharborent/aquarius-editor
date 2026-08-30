// Information architecture of the settings window: tabs across the top, and
// the panes that fill the body of the selected tab. Layout and interaction
// live in SettingsDialog.tsx; field rendering in SettingsFieldRow.tsx.
//
// Only two tabs remain. Provider keys (LLM, image/voice/video, transcription,
// stock media, sandbox, proxy, R2) are no longer configured here — the app
// leans on external agents over MCP instead. The server keystore still accepts
// every one of those names, so anything still needed can be set by hand in
// .env.local; there is simply no UI surface for it.
//
// Security invariant, unchanged: no secret value is ever backfilled into the
// browser. Every field below is a non-secret choice whose current value is
// echoed through the `models` channel of GET /api/keys.
import { t } from '../../i18n/locale';
import {
  select,
  type KeyStatusResponse,
  type SelectOption,
  type SettingsField,
  type SettingsPane,
  type SettingsTab,
} from './settingsFields';

export type {
  FieldKind,
  KeyState,
  KeyStatusResponse,
  SelectOption,
  SettingsField,
  SettingsPane,
  SettingsTab,
} from './settingsFields';

const INTERFACE_PANE: SettingsPane = {
  key: 'interface/scale',
  title: 'Interface scale',
  icon: 'layoutPanel',
  note: 'Adjust the entire editor scale (80%–150%). Desktop changes apply immediately after saving; Ctrl/Cmd + +/- adjusts quickly, and Ctrl/Cmd + 0 resets. In the browser, use the browser zoom controls.',
  fields: [
    select('UI_SCALE', 'Interface scale', '100%', [
      { value: '0.8', label: '80%' },
      { value: '0.9', label: '90%' },
      { value: '1', label: '100%' },
      { value: '1.1', label: '110%' },
      { value: '1.25', label: '125%' },
      { value: '1.5', label: '150%' },
    ]),
  ],
};

/** Transcription settings that still apply: everything runs on this machine. */
const LOCAL_ASR_PANE: SettingsPane = {
  key: 'local/asr',
  title: 'Local transcription',
  icon: 'mic',
  kind: 'local-models',
  note: 'Transcription runs on this machine: free, offline, and private. Whisper Small is built into the app and ready to use; the other tiers download on demand. Aquarius Editor selects the best available backend and falls back to CPU when WebGPU is unavailable.',
  fields: [
    select('LOCAL_ASR_MODEL', 'Default model', 'Auto (by device memory)', [
      { value: 'tiny', label: 'Whisper Tiny (~100MB · fastest)' },
      { value: 'base', label: 'Whisper Base (~80MB · balanced)' },
      { value: 'small', label: 'Whisper Small (~250MB · recommended)' },
      { value: 'medium', label: 'Whisper Medium (~1.1GB · highest accuracy)' },
    ], 'Whisper Small ships with the app; other tiers must be downloaded below before they can be selected.'),
    select('TRANSCRIPTION_LANGUAGE', 'Transcription language', 'Chinese (zh)', [
      { value: 'zh', label: 'Chinese (zh)' },
      { value: 'en', label: 'English (en)' },
      { value: 'it', label: 'Italian (it)' },
      { value: 'ja', label: 'Japanese (ja)' },
      { value: 'ko', label: 'Korean (ko)' },
      { value: 'es', label: 'Spanish (es)' },
      { value: 'fr', label: 'French (fr)' },
      { value: 'de', label: 'German (de)' },
    ]),
    select('AUTO_TRANSCRIBE_INGEST', 'Auto-transcribe after import', 'Local engine only (free)', [
      { value: 'off', label: 'Off (manual transcription)' },
      { value: 'local', label: 'Local engine only (free)' },
      { value: 'all', label: 'All engines (including paid cloud)' },
    ], 'Whether media should be transcribed as soon as it enters the media pool. The local engine is free and runs on this machine.'),
  ],
};

const MUSIC_PACK_PANE: SettingsPane = {
  key: 'local/music/packs',
  title: 'Beat and music analysis',
  icon: 'music',
  kind: 'local-models',
  fields: [],
};

const SEMANTIC_PACK_PANE: SettingsPane = {
  key: 'local/semantic/setup',
  title: 'Visual semantic search',
  icon: 'search',
  kind: 'local-models',
  fields: [],
};

export const SETTINGS_TABS: readonly SettingsTab[] = [
  {
    key: 'interface',
    title: 'Interface',
    icon: 'layoutPanel',
    hint: 'How the editor looks on this machine.',
    panes: [INTERFACE_PANE],
  },
  {
    key: 'local',
    title: 'Local models',
    icon: 'database',
    hint: 'Transcription, beat and music analysis, and visual semantic search — all on this device.',
    panes: [LOCAL_ASR_PANE, MUSIC_PACK_PANE, SEMANTIC_PACK_PANE],
  },
];

/** Temporary changes: field name in the map = staged; '' = clear (back to default). */
export type StagedValues = Record<string, string>;

export function omitKey(obj: StagedValues, name: string): StagedValues {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== name));
}

/** '' is sent as an explicit clear; other values are trimmed; blank input is no change. */
export function buildPatch(values: StagedValues): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const [name, raw] of Object.entries(values)) {
    if (raw === '') patch[name] = '';
    else if (raw.trim() !== '') patch[name] = raw.trim();
  }
  return patch;
}

export function savedMessage(): string {
  return t('Saved · Settings take effect immediately');
}

/** Current value of a non-secret setting on the server ('' = unset = default). */
export function modelValue(status: KeyStatusResponse | null, name: string): string {
  return status?.models?.[name] ?? '';
}

/** Select options with the "Default (…)" entry that clears the saved value. */
export function selectOptions(field: SettingsField): readonly SelectOption[] {
  const base = field.options ?? [];
  if (field.defaultLabel === undefined) return base;
  return [{ value: '', label: t('Default ({name})', { name: t(field.defaultLabel) }) }, ...base];
}

/** Tab lookup by key; falls back to the first tab so a stale key cannot blank the window. */
export function findTab(key: string): SettingsTab {
  return SETTINGS_TABS.find((tab) => tab.key === key) ?? SETTINGS_TABS[0];
}
