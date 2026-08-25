// Runnable check: `npx tsx server/plugins/extract-frames.verify.ts`.
// Verify frame sampling: the basic properties of uniform sampling, and the "change points
// first, then fill evenly" selection rule (change points are selected first, near-duplicates
// are not repeated, excess candidates are spread out in order rather than front-loaded, and
// out-of-window candidates are discarded — identical to uniform sampling when there are no
// candidates).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { frameSeekArgs, pickDistinctTimes, sampleTimesMs } from './extract-frames.ts';

const source = await readFile(new URL('./extract-frames.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /\bspawn\(ffprobeBin\(\)/, 'ffprobe must use the shared low-priority process launcher');

const inWindow = (times: number[], lo: number, hi: number): boolean =>
  times.every((t) => t >= lo && t < hi);
const ascending = (times: number[]): boolean =>
  times.every((t, i) => i === 0 || t >= times[i - 1]!);

assert.deepEqual(frameSeekArgs(0), [], 'a still image at zero seconds must not seek before the input');
assert.deepEqual(frameSeekArgs(1500), ['-ss', '1.5'], 'positive video timestamps keep fast seeking');

// ── Uniform sampling: evenly divided block midpoints, count, spacing ──
{
  assert.deepEqual(sampleTimesMs(0, 12000, 6), [1000, 3000, 5000, 7000, 9000, 11000], 'evenly divided block midpoints');
  assert.equal(sampleTimesMs(0, 1000, 99).length, 20, 'bounded by the MAX_SAMPLES ceiling');
  assert.equal(sampleTimesMs(0, 1000, 0).length, 1, 'count 0 still yields at least 1');
}

// ── No candidates → identical to uniform sampling (the fallback path when scene analysis fails) ──
{
  assert.deepEqual(pickDistinctTimes([], 0, 18000, 6), sampleTimesMs(0, 18000, 6), 'empty candidates = uniform sampling');
}

// ── Change points are selected first, then filled up to count with uniform sampling ──
{
  const out = pickDistinctTimes([9000, 12000, 15000], 0, 18000, 6);
  assert.equal(out.length, 6, 'filled up to count');
  for (const t of [9000, 12000, 15000]) assert.ok(out.includes(t), `change point ${t} must be included`);
  assert.ok(ascending(out) && inWindow(out, 0, 18000), 'ascending and within the window');
}

// ── Candidates too close to each other do not occupy duplicate slots (otherwise one transition could take multiple slots) ──
{
  const out = pickDistinctTimes([9000, 9050, 9100], 0, 18000, 6);
  const near = out.filter((t) => t >= 9000 && t <= 9100);
  assert.equal(near.length, 1, 'one change occupies only one slot');
}

// ── More candidates than slots → spread evenly in order, not all at the front ──
{
  const dense = Array.from({ length: 40 }, (_, i) => i * 250); // 0..9750ms dense candidates
  const out = pickDistinctTimes(dense, 0, 10000, 5);
  assert.equal(out.length, 5, 'does not exceed count');
  assert.ok(out[out.length - 1]! - out[0]! > 5000, `should cover the whole span rather than bunch at the start (got ${out.join(',')})`);
  assert.ok(ascending(out), 'ascending order');
}

// ── Candidates outside the window are discarded ──
{
  const out = pickDistinctTimes([-500, 500, 99000], 0, 3000, 3);
  assert.ok(inWindow(out, 0, 3000), `out-of-window candidates must be discarded (got ${out.join(',')})`);
  assert.ok(out.includes(500), 'in-window candidates are kept');
}

// ── An interval that isn't at the start of the window (view_asset_frames passes fromMs/toMs) ──
{
  const out = pickDistinctTimes([7000], 5000, 9000, 3);
  assert.ok(inWindow(out, 5000, 9000), 'within the relative interval');
  assert.ok(out.includes(7000), 'change points within the interval are kept');
}

console.log('extract-frames.verify: ok (uniform sampling / empty-candidate fallback / change-point priority / near-duplicate dedup / even spread / window clipping)');
