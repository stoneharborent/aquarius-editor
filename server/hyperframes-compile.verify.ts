// The compile stage exists because the regex linter cannot see runtime faults.
// These cases are drafts a real 4B model produced during this feature's
// benchmark runs: every one of them passed the contract linter and then threw
// on the first frame. Catching them here is what turns a broken graphic on the
// timeline into one more repair turn.
import assert from 'node:assert/strict';
import { compileHyperframesComposition } from './hyperframes-compile.ts';
import { lintHyperframesComposition } from '../shared/hyperframes-contract.ts';
import { builtinLlmModelProblem, builtinLlmModelState } from './builtin-llm/model-file.ts';
import { builtinLlmModel } from '../shared/llm-model-catalog.ts';

const CANVAS = { width: 1920, height: 1080, fps: 30, durationInFrames: 150 } as const;

const GOOD = `const Title = ({ item }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const p = item.props || {};
  const rise = spring({ frame, fps, config: { damping: 16, stiffness: 120 } });
  const out = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity: rise * out }}>{p.title || 'Hello'}</AbsoluteFill>;
};`;

// ── A composition that runs is accepted ──────────────────────────────────────
{
  const result = await compileHyperframesComposition(GOOD, CANVAS);
  assert.deepEqual(result, { ok: true, errors: [] });
}

// ── Reading a const before its initializer: lints clean, throws at frame 0 ───
{
  const tdz = `const Countdown = ({ item }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const shown = count > 1 ? count : 1;
  const count = Math.ceil(5 - (frame / durationInFrames) * 5);
  return <AbsoluteFill>{shown}</AbsoluteFill>;
};`;
  assert.equal(lintHyperframesComposition(tdz).ok, true, 'the regex linter cannot see this');
  const result = await compileHyperframesComposition(tdz, CANVAS);
  assert.equal(result.ok, false);
  assert.match(result.errors[0]!, /threw while rendering frame 0/);
  assert.match(result.errors[0]!, /count/, 'the repair message must name the offending identifier');
}

// ── A typo'd identifier ──────────────────────────────────────────────────────
{
  const typo = `const Badge = ({ item }) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: fadeIn }}>{item.props.title}</AbsoluteFill>;
};`;
  const result = await compileHyperframesComposition(typo, CANVAS);
  assert.equal(result.ok, false);
  assert.match(result.errors[0]!, /fadeIn/);
}

// ── Props are empty on the timeline until a user fills them in ───────────────
{
  const assumesProps = `const Lower = ({ item }) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill>{item.props.title.toUpperCase()}</AbsoluteFill>;
};`;
  const result = await compileHyperframesComposition(assumesProps, CANVAS);
  assert.equal(result.ok, false, 'a composition must render before anyone sets a prop');
  assert.match(result.errors[0]!, /item\.props` empty|props/);
}

// ── A late-frame throw is caught too, not just frame 0 ───────────────────────
{
  const lateThrow = `const Late = ({ item }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const steps = [1, 2, 3];
  const step = frame > durationInFrames / 2 ? steps[9].value : 0;
  return <AbsoluteFill>{step}</AbsoluteFill>;
};`;
  const result = await compileHyperframesComposition(lateThrow, CANVAS);
  assert.equal(result.ok, false);
  assert.match(result.errors[0]!, /threw while rendering frame (74|149)/);
}

// ── Syntax that Babel cannot parse is reported as such ───────────────────────
{
  const broken = 'const Broken = ({ item }) => { return <AbsoluteFill>unclosed; };';
  const result = await compileHyperframesComposition(broken, CANVAS);
  assert.equal(result.ok, false);
  assert.match(result.errors[0]!, /does not parse/);
}

// ── A one-frame clip still compiles (frames de-duplicate to [0]) ─────────────
{
  const result = await compileHyperframesComposition(GOOD, { ...CANVAS, durationInFrames: 1 });
  assert.equal(result.ok, true);
}

// ── Missing built-in weights surface as an explanation, never as silence ─────
{
  const model = builtinLlmModel();
  const missing = builtinLlmModelState('/nowhere', model, () => { throw new Error('ENOENT'); });
  assert.equal(missing.status, 'missing');
  assert.equal(builtinLlmModelProblem(missing), 'model-missing');

  const corrupt = builtinLlmModelState('/nowhere', model, () => ({ size: 12, isFile: () => true }));
  assert.equal(corrupt.status, 'corrupt');
  assert.equal(builtinLlmModelProblem(corrupt), 'model-corrupt');

  const ready = builtinLlmModelState(
    '/home/user',
    model,
    () => ({ size: model.file.sizeBytes, isFile: () => true }),
  );
  assert.equal(ready.status, 'ready');
  assert.equal(builtinLlmModelProblem(ready), null);
  assert.ok(
    ready.path.endsWith(model.file.cachePath.replaceAll('/', '/')),
    'the weights are looked for exactly where seeding puts them',
  );

  const directory = builtinLlmModelState('/home/user', model, () => ({ size: 0, isFile: () => false }));
  assert.equal(directory.status, 'missing', 'a directory at the model path is not a model');
}

console.log('hyperframes-compile.verify: runtime faults caught, parse errors reported, weight states OK');
