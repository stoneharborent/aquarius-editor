import assert from 'node:assert/strict';
import ZH_DATA_TEMPLATES from '../zh/templates-data';
import { IT } from './index';
import IT_DATA from './templates-data';

const required = [
  'Multilingual word-level transcription · on-device model · all {n} clips on this track transcribe one by one (free, offline, media stays on this machine). Then click words to cut them (delete a word = cut the audio).',
  'Multilingual word-level transcription · speaker diarization · all {n} clips on this track upload one by one. Then click words to cut them (delete a word = cut the audio).',
  'Clean White',
  'Subtitle Bar',
  'Caption styles',
  'Download original',
  'Export transparent MOV',
  'Exporting…',
  'Media export failed: {message}',
  'Import folder…',
  'Stop preparing watch folder “{dir}”',
  'Stop watching “{dir}”',
  'Choosing a folder to watch…',
  'Watch folder (automatically import new media)…',
] as const;

for (const key of required) {
  assert.ok(IT[key], `missing Italian translation for ${key}`);
  assert.notEqual(IT[key], key, `Italian translation must not fall back to the English source for ${key}`);
}

for (const key of Object.keys(ZH_DATA_TEMPLATES)) {
  assert.ok(IT_DATA[key], `missing Italian template label for ${key}`);
  assert.notEqual(IT_DATA[key], key, `Italian template label must not fall back to English for ${key}`);
}

console.log(`it mediaCoverage.verify: ${required.length} UI keys and ${Object.keys(ZH_DATA_TEMPLATES).length} template labels covered`);
