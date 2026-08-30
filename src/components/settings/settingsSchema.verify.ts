// The settings window is two tabs: Interface and Local models. Everything else
// (agent models, network proxy, AI generation, stock media + cloud
// transcription, storage/R2, sandbox + web scraping) was removed — the app
// leans on external agents over MCP instead. This verify is what keeps a
// removed section from quietly growing back.
import assert from 'node:assert/strict';
import { SETTINGS_TABS, buildPatch, findTab, omitKey, selectOptions } from './settingsSchema.ts';

assert.deepEqual(
  SETTINGS_TABS.map((tab) => tab.key),
  ['interface', 'local'],
  'settings has exactly two tabs, in this order',
);

const REMOVED_TABS = ['agent', 'proxy', 'generation', 'assets', 'cloud', 'tools'];
for (const key of REMOVED_TABS) {
  assert.equal(
    SETTINGS_TABS.some((tab) => tab.key === key),
    false,
    `the "${key}" settings section was removed and must not come back`,
  );
}

const panes = SETTINGS_TABS.flatMap((tab) => tab.panes);
assert.deepEqual(
  panes.map((pane) => pane.key),
  ['interface/scale', 'local/asr', 'local/music/packs', 'local/semantic/setup'],
);

const fields = panes.flatMap((pane) => pane.fields);
assert.deepEqual(
  fields.map((field) => field.name),
  ['UI_SCALE', 'LOCAL_ASR_MODEL', 'TRANSCRIPTION_LANGUAGE', 'AUTO_TRANSCRIBE_INGEST'],
);

// No secret ever reaches the browser: every remaining field is a plain choice
// whose current value the server echoes back through /api/keys `models`.
for (const field of fields) {
  assert.equal(field.kind, 'select', `${field.name} must be a non-secret choice`);
  assert.ok(field.options?.length, `${field.name} must offer options`);
  assert.ok(field.defaultLabel, `${field.name} must name its default`);
}

// Removed provider surfaces leave no field behind.
for (const field of fields) {
  assert.doesNotMatch(
    field.name,
    /^(LLM_|CODEX_|PREFERRED_|R2_|IMAGE_|MINIMAX_|GEMINI_|PROXY_|E2B_|FIRECRAWL_|OPENCHATCUT_DATA_DIR)/,
    `${field.name} belongs to a removed settings section`,
  );
}

// Whisper Small ships with the app; the pane copy must say so.
const localAsr = panes.find((pane) => pane.key === 'local/asr');
assert.ok(localAsr?.note);
assert.match(localAsr.note, /built into the app/i,
  'the local transcription pane must tell the user the recommended tier is pre-installed');

// The "Default (…)" option is what clears a saved value.
const scale = fields.find((field) => field.name === 'UI_SCALE');
assert.ok(scale);
assert.equal(selectOptions(scale)[0]?.value, '');

// Staging semantics survive the rewrite: '' is an explicit clear, blank is not a change.
assert.deepEqual(buildPatch({ UI_SCALE: '', LOCAL_ASR_MODEL: '  ', TRANSCRIPTION_LANGUAGE: ' en ' }),
  { UI_SCALE: '', TRANSCRIPTION_LANGUAGE: 'en' });
assert.deepEqual(omitKey({ UI_SCALE: '1.25', LOCAL_ASR_MODEL: 'small' }, 'UI_SCALE'),
  { LOCAL_ASR_MODEL: 'small' });

// A stale tab key can never blank the window.
assert.equal(findTab('cloud').key, 'interface');
assert.equal(findTab('local').key, 'local');

console.log('settingsSchema.verify: two tabs, no removed sections, non-secret fields only');
