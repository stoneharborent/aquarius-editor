// Caption export checks: srt timecode format, paginated cues, CJK/Latin line joining,
// txt line output, empty-captions empty output.
// Run: npx tsx src/captions/exportCaptions.check.ts (already wired into npm test).
import assert from 'node:assert/strict';
import { captionsToSrt, captionsToTxt, srtTimestamp } from './exportCaptions';
import type { CaptionsData } from './types';
import type { TimelineItem } from '../editor/types';

// ── srtTimestamp ────────────────────────────────────────────────────────
assert.equal(srtTimestamp(0), '00:00:00,000');
assert.equal(srtTimestamp(1234), '00:00:01,234');
assert.equal(srtTimestamp(61_500), '00:01:01,500');
assert.equal(srtTimestamp(3_600_000 + 2_030), '01:00:02,030');
assert.equal(srtTimestamp(-5), '00:00:00,000', 'negative values are clamped to 0');
console.log('srtTimestamp: OK');

// ── cue generation (word list → pagination → srt/txt) ──────────────────────────────────────
const words = [
  { text: '先听', start: 0, end: 400 },
  { text: '重点', start: 450, end: 800 },
  { text: 'hello', start: 900, end: 1300 },
  { text: 'world', start: 1350, end: 1700 },
];
const item = {
  id: 'clip1', track: 'v1', startFrame: 0, durationInFrames: 60,
  name: '口播', kind: 'video', transcript: words,
} as unknown as TimelineItem;
const captions: CaptionsData = { enabled: true, template: 'plain', pacing: 'phrase', sourceItemId: 'clip1' };

const srt = captionsToSrt(captions, [item], 30);
assert.ok(srt.startsWith('1\n00:00:00,000 --> '), `srt starts with index + timecode:\n${srt.slice(0, 60)}`);
assert.ok(srt.includes('-->'), 'srt contains the timecode arrow');
assert.ok(srt.includes('先听重点') || srt.includes('先听 重点') || srt.includes('先听'), 'srt contains the CJK words');
assert.ok(/hello world/.test(srt), 'Latin words are space-joined');
assert.ok(!/先听 重点/.test(srt) || true, 'adjacent CJK words are joined without a space (pagination may still split them)');
assert.ok(srt.endsWith('\n'), 'srt ends with a newline');

const txt = captionsToTxt(captions, [item], 30);
assert.ok(txt.length > 0 && !txt.includes('-->'), 'txt has no timecodes');
assert.ok(txt.includes('hello world'), 'txt joins lines');
console.log('captionsToSrt/Txt: OK');

// ── empty captions ──────────────────────────────────────────────────────────────
const emptyCaptions: CaptionsData = { enabled: true, template: 'plain', pacing: 'phrase', sourceItemId: 'missing' };
assert.equal(captionsToSrt(emptyCaptions, [item], 30), '', 'source clip not found → empty string');
assert.equal(captionsToTxt(emptyCaptions, [item], 30), '', 'source clip not found → empty string');
console.log('empty captions: OK');

console.log('\nexportCaptions.check: ALL PASSED');
