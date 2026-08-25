// Runnable contract check: `npx tsx src/agent/highlight-tool.check.ts`.
// Covers the deterministic core of smart slicing (long-to-short): N highlights -> N vertical
// sequences, trimmed to the highlight frame range, verified word/frame consistency, cuts landing
// on word boundaries without changing any word's text/timing, and validation against untrustworthy
// LLM output (out-of-range/overlapping). The LLM is fed canned JSON via a stub — never touches the network.
import assert from 'node:assert';
import { makeDraft } from '../../editor/store';
import type { TimelineState } from '../../editor/types';
import type { TranscriptWord } from '../../transcript/types';
import { docFromTimeline } from '../../persist/projectStore';
import type { AgentContext } from '../context';
import { execHighlightTool, validateHighlights, setHighlightSelector } from './highlight-tool';

// fps 30 -> msToFrame(ms)=round(ms/1000*30): 0->0, 500->15, 1000->30, 1400->42, 1700->51, 2000->60, 2600->78, 3000->90, 3500->105
const words: TranscriptWord[] = [
  { text: 'hello', start: 0, end: 500, speaker: 'A' },
  { text: 'world', start: 500, end: 1000, speaker: 'A' },
  { text: 'this', start: 1000, end: 1400, speaker: 'A' },
  { text: 'is', start: 1400, end: 1700, speaker: 'A' },
  { text: 'the', start: 1700, end: 2000, speaker: 'A' },
  { text: 'best', start: 2000, end: 2600, speaker: 'A' },
  { text: 'part', start: 2600, end: 3000, speaker: 'A' },
  { text: 'ever', start: 3000, end: 3500, speaker: 'A' },
];

const state: TimelineState = {
  fps: 30, width: 1920, height: 1080, selectedId: null,
  items: [
    { id: 'talk', track: 'V1', startFrame: 0, durationInFrames: 105, name: 'Talking head', kind: 'video', src: '/talk.mp4', transcript: words },
    { id: 'ov', track: 'V2', startFrame: 60, durationInFrames: 30, name: 'Overlay MG', kind: 'motion-graphic', code: '' },
    { id: 'far', track: 'V2', startFrame: 200, durationInFrames: 30, name: 'Far MG', kind: 'motion-graphic', code: '' },
  ],
};

const draft = makeDraft(docFromTimeline(state));
const ctx: AgentContext = { commands: draft.commands, getState: draft.getState, getDoc: draft.getDoc, getCreativeMode: () => null, templates: [], audio: [] };
const originalActiveId = draft.getDoc().activeTimelineId;

// ── 1) Direct test of validateHighlights: out-of-range / start>end / overlap are all rejected ────────
assert.strictEqual(validateHighlights({ nope: true }, 8, 5).length, 0, 'non-array -> empty');
assert.strictEqual(
  validateHighlights([{ startWordIndex: -1, endWordIndex: 2 }, { startWordIndex: 5, endWordIndex: 99 }, { startWordIndex: 3, endWordIndex: 1 }], 8, 5).length,
  0, 'out-of-range and start>end are all discarded',
);
const overlap = validateHighlights([{ startWordIndex: 0, endWordIndex: 3, title: 'a' }, { startWordIndex: 2, endWordIndex: 5, title: 'b' }], 8, 5);
assert.strictEqual(overlap.length, 1, 'overlapping segments dedupe down to one');
assert.deepStrictEqual([overlap[0].startWordIndex, overlap[0].endWordIndex], [0, 3], 'the first-occurring range is kept');
assert.strictEqual(
  validateHighlights([{ startWordIndex: 0, endWordIndex: 0 }, { startWordIndex: 1, endWordIndex: 1 }, { startWordIndex: 2, endWordIndex: 2 }], 8, 2).length,
  2, 'the max cap is enforced',
);

// ── 2) End-to-end (stub LLM): canned JSON includes one out-of-range item, which should be rejected, not crash ──────────
setHighlightSelector(async () => [
  { startWordIndex: 0, endWordIndex: 1, title: 'Opening' },
  { startWordIndex: 0, endWordIndex: 99, title: 'Out of range', reason: 'bad' }, // out-of-range → dropped, not a crash
  { startWordIndex: 2, endWordIndex: 6, title: 'Best part', reason: 'high information density' },
]);

const res = await execHighlightTool('find_highlights', { count: 5, ratio: '9:16' }, ctx) as {
  ok: boolean; count: number; shorts: { timelineId: string; title: string; startFrame: number; endFrame: number; ratio: string }[];
};
assert.strictEqual(res.ok, true, 'the tool returns success');
assert.strictEqual(res.shorts.length, 2, 'the out-of-range candidate is dropped from the 3 → 2 shorts');
assert.strictEqual(res.count, 2);

// After sorting: [0,1]=Opening, [2,6]=Best part
assert.deepStrictEqual(res.shorts.map((s) => s.title), ['Opening', 'Best part']);
const hot = res.shorts[1];
assert.deepStrictEqual([hot.startFrame, hot.endFrame, hot.ratio], [30, 90, '9:16'], 'the highlight frame range comes from word-boundary ms x fps');

const doc = draft.getDoc();
assert.strictEqual(doc.activeTimelineId, originalActiveId, 'activate:false → the view returns to the original sequence when done');
assert.strictEqual(doc.timelines.length, 3, 'original sequence + 2 shorts');

// Each short is a 9:16 retargeted canvas (cover)
for (const s of res.shorts) {
  const tl = doc.timelines.find((t) => t.id === s.timelineId)!;
  assert.deepStrictEqual([tl.width, tl.height, tl.fit], [1080, 1920, 'cover'], `${s.title} is a 9:16 vertical cover`);
}

// ── 3) Rich sample ("Best part" [2,6]): trimming keeps only the highlight span and preserves word/frame consistency ────────────────
const short = doc.timelines.find((t) => t.id === hot.timelineId)!;
const talk = short.items.find((it) => it.id === 'talk')!;

// Cuts land on word boundaries; kept words' text/timestamps are untouched — outside words are flagged via deletedWordIdx.
assert.strictEqual(talk.transcript!.length, 8, 'no transcript word is removed (only flagged); word<->frame pairing still holds');
assert.deepStrictEqual([...(talk.deletedWordIdx ?? [])].sort((a, b) => a - b), [0, 1, 7], 'words outside the highlight (0,1,7) are flagged deleted');
assert.strictEqual(talk.transcript![2].text, 'this', 'kept word text is unchanged');
assert.strictEqual(talk.transcript![2].start, 1000, 'kept word start ms is unchanged');
assert.strictEqual(talk.transcript![6].end, 3000, 'kept word end ms is unchanged');
assert.deepStrictEqual(talk.transcript!.map((w) => w.text), words.map((w) => w.text), 'no word text was rewritten');
// The highlight span is shifted to 0; duration = the frame range span
assert.strictEqual(talk.startFrame, 0, 'the highlight span playback start is aligned to 0');
assert.strictEqual(talk.durationInFrames, 60, 'clip duration = spanEnd-spanStart = 90-30');

// Other clips: overlapping MG is trimmed and shifted; MG fully outside the range is removed
const ov = short.items.find((it) => it.id === 'ov')!;
assert.deepStrictEqual([ov.startFrame, ov.durationInFrames], [30, 30], 'overlapping MG is trimmed into range and shifted by -spanStart');
assert.strictEqual(short.items.find((it) => it.id === 'far'), undefined, 'MG outside the range is removed');
assert.strictEqual(short.items.length, 2, 'the short keeps only clips within the highlight span');

// The [0,1] short: both MGs are outside the range -> only the talking head remains
const opening = doc.timelines.find((t) => t.id === res.shorts[0].timelineId)!;
assert.strictEqual(opening.items.length, 1, 'the opening short keeps only the talking-head clip');
assert.strictEqual(opening.items[0].durationInFrames, 30, 'the opening duration = the span of the first two words');

// ── 4) No transcript -> a clear error, no crash, no sequence created ──────────────────────────────────
const bareState: TimelineState = { fps: 30, width: 1920, height: 1080, selectedId: null, items: [{ id: 'v', track: 'V1', startFrame: 0, durationInFrames: 90, name: 'v', kind: 'video', src: '/v.mp4' }] };
const bare = makeDraft(docFromTimeline(bareState));
const bareCtx: AgentContext = { commands: bare.commands, getState: bare.getState, getDoc: bare.getDoc, getCreativeMode: () => null, templates: [], audio: [] };
const err = await execHighlightTool('find_highlights', { count: 3 }, bareCtx) as { error?: string };
assert.ok(err.error && /transcribed/.test(err.error), 'no transcript returns a clear error');
assert.strictEqual(bare.getDoc().timelines.length, 1, 'the error path creates no new sequence');

setHighlightSelector(null); // restore the real LLM path
console.log('highlight-tool.check: ok');
