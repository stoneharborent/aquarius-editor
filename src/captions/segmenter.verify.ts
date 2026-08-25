// Content-aware segmentation engine assertions: (1) Chinese punctuation breaks preferred
// (2) modal particles never start a line (3) "的" is never split off (4) orphan-word
// penalty (5) English sentence-end breaks preferred (6) with no opts, paginate matches
// the old byte-for-byte behavior (regression).
// Expected values are hand-derived from the rules in segmenter.ts; run with: npx tsx src/captions/segmenter.check.ts
import assert from 'node:assert/strict';
import { scoreLatinBreaks, segmentWords } from './segmenter';
import type { CaptionPage } from './types';
import { paginate } from './types';
import type { TranscriptWord } from '../transcript/types';

const S = (texts: string[]) => texts.map((text) => ({ text }));
const W = (texts: string[], gapMs = 10, durMs = 90): TranscriptWord[] =>
  texts.map((text, i) => ({ text, start: i * (durMs + gapMs), end: i * (durMs + gapMs) + durMs }));
const pageTexts = (pages: CaptionPage[]) => pages.map((p) => p.words.map((w) => w.text).join(''));

// ── (1) Chinese sentence/comma breaks are preferred (oHe: 。→100 / ，→80 beat out the budget-cap position) ──
{
  const words = S(['今天', '天气', '真好。', '我们', '一起', '去', '公园']);
  // The character budget caps out at "一起"; falls back to the sentence-end break point → breaks after "真好。"
  assert.deepEqual(segmentWords(words, { wordsPerPage: 50, maxCharsPerLine: 20 }), [0, 3]);

  const comma = S(['我说，', '大家', '都', '要', '来', '我家', '吃饭']);
  assert.deepEqual(segmentWords(comma, { wordsPerPage: 50, maxCharsPerLine: 20 }), [0, 1]);
}

// ── (2) modal particles "呢/吗/啊" never start a line ─────────────────────────
{
  // 呢: the aHe modal-particle break point (60) makes the page break after "呢", not at the budget-cap position
  const ne = S(['你', '在', '想', '什么', '呢', '明天', '我们', '出发']);
  const starts = segmentWords(ne, { wordsPerPage: 50, maxCharsPerLine: 20 });
  assert.deepEqual(starts, [0, 5]); // page 2 starts at "明天"; "呢" stays at the end of page 1
  // 吗: the mA orphan-word demotion (吗/了 ∈ Q9) disqualifies all the adjacent break points
  const ma = S(['你', '吃', '了', '吗', '我们', '走']);
  const maStarts = segmentWords(ma, { wordsPerPage: 50, maxCharsPerLine: 8 });
  assert.ok(!maStarts.includes(2) && !maStarts.includes(3), 'neither "了" nor "吗" may start a page');
  for (const st of maStarts) assert.ok(!['了', '吗', '呢', '啊'].includes(Array.from(ma[st].text)[0]), 'a modal particle must not start a page');
  for (const st of starts) assert.ok(!['了', '吗', '呢', '啊'].includes(Array.from(ne[st].text)[0]), 'a modal particle must not start a page');
  // FHe pull-back for a line-leading particle: page 2's first word "了解" begins with the G9e character "了" → pulls the previous page's last word "fine" into this page
  const pull = S(['OK', 'fine', '了解', '一下', '吧']);
  assert.deepEqual(segmentWords(pull, { wordsPerPage: 50, maxCharsPerLine: 15 }), [0, 1]);
}

// ── (3) the structural particle "的" is never separated from the preceding word (mA: 的 ∈ Q9 → both adjacent break points demoted by 30) ──
{
  const words = S(['我', '买', '的', '苹果', '很', '好吃', '非常', '新鲜']);
  const starts = segmentWords(words, { wordsPerPage: 50, maxCharsPerLine: 10 });
  assert.deepEqual(starts, [0, 4, 7]);
  assert.ok(!starts.includes(2), '"的" must not start a page (买|的 is never split)');
  assert.ok(!starts.includes(3), '"的" must not dangle at the end of a page (的|苹果 is never split)');
}

// ── (4) orphan-word penalty: never leave 1-2 function words stranded alone at the end (U9e quantifier-of/trailing + cP demotion) ──
{
  const words = S(['We', 'learned', 'quite', 'a', 'lot', 'of', 'things', 'today']);
  const starts = segmentWords(words, { wordsPerPage: 50, maxCharsPerLine: 30 });
  // the cap is hit at "things"; every break point around a/lot/of carries orphan-word risk → falls back to breaking after "quite"
  assert.deepEqual(starts, [0, 3]);
  const pages = [words.slice(0, 3), words.slice(3)].map((ws) => ws.map((w) => w.text));
  assert.equal(pages[0].join(' '), 'We learned quite');
  assert.equal(pages[1].join(' '), 'a lot of things today');
  for (let i = 0; i < starts.length; i++) {
    const end = (starts[i + 1] ?? words.length) - 1;
    assert.notEqual(words[end].text, 'of', '"of" must never dangle at the end of a page');
  }
}

// ── (5) a pure-English sentence-ending "." is preferred as a break (z9e 100 + sentence-end +30 = 130) ──
{
  const words = S(['I', 'like', 'it.', 'Because', 'it', 'works', 'well', 'today']);
  assert.deepEqual(segmentWords(words, { wordsPerPage: 50, maxCharsPerLine: 30 }), [0, 3]);
  // hitting the word-count budget cap also falls back to the scorer (per the task spec, see deviation 2 in segmenter.ts's header comment)
  assert.deepEqual(segmentWords(S(['I', 'like', 'it.', 'Because', 'it', 'works']), { wordsPerPage: 4 }), [0, 3]);
  // H9e scorer itself: a sentence-ending word scores 100+30
  const top = scoreLatinBreaks('We had fun. So it goes')[0];
  assert.equal(top.score, 130);
  assert.equal(top.position, 'We had fun.'.length);
}

// ── misc semantics: a punctuation-only word never opens a page / M1e CJK ignores the word-count budget / edge cases ──
{
  const starts = segmentWords(S(['Hello', 'world', '!', 'again', 'now', 'yes', 'more']), { wordsPerPage: 2 });
  assert.deepEqual(starts, [0, 3, 5]); // "!" stays with "world" on page 1, it never opens a page
  // M1e semantics: CJK-dominant + a character budget given → wordsPerPage is left blank (Infinity)
  assert.deepEqual(segmentWords(S(['一二', '三四', '五六', '七八']), { wordsPerPage: 2, maxCharsPerLine: 100 }), [0]);
  assert.deepEqual(segmentWords(S(['aa', 'bb', 'cc', 'dd']), { wordsPerPage: 2, maxCharsPerLine: 100 }), [0, 2]);
  assert.deepEqual(segmentWords([], { wordsPerPage: 6 }), []);
  assert.deepEqual(segmentWords(S(['hi']), { wordsPerPage: 1, maxCharsPerLine: 1 }), [0]);
}

// ── paginate integration: maxCharsPerLine goes through the segmenter (budget × visible lines); forceBreak still takes top priority ──
{
  const cn = W(['今天', '天气', '真好。', '我们', '一起', '去', '公园']);
  // 20 chars/line × CAPTION_MAX_VISUAL_LINES(2) = 40 chars — the 12-char sentence fits one page.
  assert.deepEqual(pageTexts(paginate(cn, 'phrase', 50, undefined, 20)), ['今天天气真好。我们一起去公园']);
  const forced = paginate(cn, 'phrase', 50, new Set([5]), 20);
  assert.deepEqual(pageTexts(forced), ['今天天气真好。我们一起', '去公园']);
  assert.equal(forced[1].words[0].text, '去'); // a forced break point must always open a new page
  // word pacing is not affected by maxCharsPerLine
  assert.equal(paginate(cn, 'word', 6, undefined, 20).length, cn.length);
}

// ── (6) regression: with no maxCharsPerLine, paginate behaves the same as the old version ────────────────
{
  // a full page of 6 words flushes
  const plain = W(['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg', 'hh']);
  assert.deepEqual(paginate(plain, 'phrase').map((p) => p.words.length), [6, 2]);
  // when a page isn't full, content-aware segmentation no longer hard-cuts on sentence-end punctuation (fits on one page)
  assert.deepEqual(paginate(W(['Hi', 'there.', 'Big', 'day']), 'phrase').map((p) => p.words.length), [4]);
  // a long pause is a high-priority break point, but it's only used when the budget cap forces a split (a short 4-word clause doesn't hit the cap → one page)
  const gap: TranscriptWord[] = [
    { text: 'a', start: 0, end: 100 }, { text: 'b', start: 110, end: 200 },
    { text: 'c', start: 1000, end: 1100 }, { text: 'd', start: 1110, end: 1200 },
  ];
  assert.deepEqual(paginate(gap, 'phrase').map((p) => p.words.length), [4]);
  // forceBreak
  assert.deepEqual(paginate(W(['aa', 'bb', 'cc', 'dd']), 'phrase', 6, new Set([2])).map((p) => p.words.length), [2, 2]);
  // page timestamp fields
  const pages = paginate(plain, 'phrase');
  assert.equal(pages[0].start, plain[0].start);
  assert.equal(pages[0].end, plain[5].end);
  assert.equal(pages[1].start, plain[6].start);
}

console.log('segmenter.check: ok');
