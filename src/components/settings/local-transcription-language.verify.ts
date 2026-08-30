// Transcription is a local-models feature now: the cloud provider pages are
// gone, so this guards the one language selector that is left plus the catalog
// claim that every Whisper tier handles Italian.
import assert from 'node:assert/strict';
import { ASR_MODELS } from '../../../shared/asr-models';
import { SETTINGS_TABS } from './settingsSchema';

const localAsrPane = SETTINGS_TABS
  .flatMap((tab) => tab.panes)
  .find((pane) => pane.key === 'local/asr');
assert.ok(localAsrPane, 'the local transcription pane must exist');

const language = localAsrPane.fields.find((field) => field.name === 'TRANSCRIPTION_LANGUAGE');
assert.ok(language, 'local transcription must expose a transcription language selector');
for (const value of ['it', 'en', 'zh']) {
  assert.ok(
    language.options?.some((option) => option.value === value),
    `local transcription must offer the "${value}" language`,
  );
}

for (const model of ASR_MODELS) {
  assert.match(model.language, /Italian|Italiano|it/i, `${model.id} should be advertised as Italian-capable`);
}

console.log('local-transcription-language.verify: Italian transcription is exposed on the local pane');
