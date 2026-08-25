// Black-box check for the unified Job model (Plan A3). Run: tsx src/agent/job-model.check.ts
import assert from 'node:assert/strict';
import {
  normalizeStatus,
  isTerminal,
  isComplete,
  isFailed,
  TERMINAL_STATUSES,
  type JobStatus,
} from './job-model';

// ── normalizeStatus: each family's wire status -> canonical ────────────────
const NORM: ReadonlyArray<[string, JobStatus]> = [
  ['pending', 'pending'],
  ['queued', 'pending'], // the generation/export families' "queued"
  ['running', 'running'],
  ['processing', 'running'],
  ['complete', 'complete'],
  ['completed', 'complete'], // export family's terminal wire status
  ['succeeded', 'complete'], // generation family's terminal wire status
  ['success', 'complete'],
  ['done', 'complete'], // transcription store's terminal wire status
  ['failed', 'failed'],
  ['error', 'failed'],
  ['not_found', 'not_found'],
  ['missing', 'not_found'],
];
for (const [wire, canonical] of NORM) {
  assert.equal(normalizeStatus(wire), canonical, `normalizeStatus(${wire})`);
}

// Case- and whitespace-insensitive
assert.equal(normalizeStatus('SUCCEEDED'), 'complete');
assert.equal(normalizeStatus('  Done  '), 'complete');
assert.equal(normalizeStatus('Queued'), 'pending');

// Unknown string -> running (non-terminal, keep polling instead of misclassifying as terminal)
assert.equal(normalizeStatus('weird-status'), 'running');
assert.equal(normalizeStatus(''), 'running');

// ── isTerminal / isComplete / isFailed ────────────────────────────────────
for (const t of ['complete', 'completed', 'succeeded', 'done', 'failed', 'error', 'not_found', 'missing']) {
  assert.equal(isTerminal(t), true, `isTerminal(${t}) should be true`);
}
for (const nt of ['pending', 'queued', 'running', 'processing', 'weird', '']) {
  assert.equal(isTerminal(nt), false, `isTerminal(${nt}) should be false`);
}
for (const c of ['complete', 'completed', 'succeeded', 'done']) {
  assert.equal(isComplete(c), true, `isComplete(${c})`);
  assert.equal(isFailed(c), false, `isFailed(${c})`);
}
for (const f of ['failed', 'error']) {
  assert.equal(isFailed(f), true, `isFailed(${f})`);
  assert.equal(isComplete(f), false, `isComplete(${f})`);
}
// not_found is terminal, but neither complete nor failed
assert.equal(isTerminal('not_found'), true);
assert.equal(isComplete('not_found'), false);
assert.equal(isFailed('not_found'), false);

// TERMINAL_STATUSES contents are locked
assert.deepEqual([...TERMINAL_STATUSES].sort(), ['complete', 'failed', 'not_found']);

// ── Isomorphism assertion: the terminal wire statuses of all three families are correctly
// classified by the same authority (the core goal of A3) ──────────────────────────────
// Generation family's succeeded / export family's completed / transcription store's done —
// all should be judged "complete + terminal"; each family's in-flight states
// (queued/running) should all be judged "non-terminal".
const FAMILY_COMPLETE = ['succeeded', 'completed', 'done'];
const FAMILY_INFLIGHT = ['queued', 'running'];
for (const done of FAMILY_COMPLETE) {
  assert.equal(isComplete(done), true, `family complete wire ${done}`);
  assert.equal(isTerminal(done), true, `family complete wire ${done} terminal`);
}
for (const live of FAMILY_INFLIGHT) {
  assert.equal(isTerminal(live), false, `family in-flight wire ${live} non-terminal`);
}

console.log('job-model.check.ts OK');
