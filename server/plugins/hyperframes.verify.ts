// The generation route, exercised with the model call stubbed out — no network.
// What matters here is the repair loop (a bad draft is sent back with its own
// lint errors and the retried composition is the one that ships) and that an
// unconfigured install is reported rather than pretended away.
import assert from 'node:assert/strict';
import {
  MAX_BUILTIN_HYPERFRAMES_REPAIRS,
  MAX_HYPERFRAMES_REPAIRS,
  parseHyperframesRequest,
  resolveHyperframesLlm,
  runHyperframesGeneration,
  type HyperframesAuthor,
} from './hyperframes.ts';
import { HYPERFRAMES_MAX_FRAMES, HYPERFRAMES_MIN_FRAMES } from '../../shared/hyperframes-contract.ts';
import { BUILTIN_LLM_PROVIDER } from '../../shared/llm-providers.ts';
import { builtinLlmModel } from '../../shared/llm-model-catalog.ts';
import type { BuiltinLlmModelState } from '../builtin-llm/model-file.ts';

const BUILTIN_MODEL = builtinLlmModel();
const BUILTIN_READY: BuiltinLlmModelState = {
  status: 'ready',
  path: '/models/builtin.gguf',
  model: BUILTIN_MODEL,
};
const BUILTIN_MISSING: BuiltinLlmModelState = {
  status: 'missing',
  path: '/models/builtin.gguf',
  model: BUILTIN_MODEL,
};

const REQUEST = {
  prompt: 'a neon lower third for a chef interview',
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 150,
} as const;

const GOOD = `const NeonLowerThird = ({ item }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const p = item.props || {};
  const rise = spring({ frame, fps, config: { damping: 16, stiffness: 120 } });
  const out = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity: rise * out }}>{p.title || 'Chef'}</AbsoluteFill>;
};`;

// A draft that a real model plausibly produces: browser animation, not host time.
const BAD_WALL_CLOCK = `const NeonLowerThird = ({ item }) => {
  const t = Date.now() / 1000;
  return <AbsoluteFill style={{ opacity: (t % 1) }}>{item.props.title}</AbsoluteFill>;
};`;

const BAD_GSAP = `import gsap from 'gsap';
const NeonLowerThird = ({ item }) => {
  gsap.to('.title', { opacity: 1 });
  return <AbsoluteFill>{item.props.title}</AbsoluteFill>;
};`;

function scriptedAuthor(replies: string[]): { author: HyperframesAuthor; calls: Array<{ system: string; messages: Array<{ role: string; content: string }> }> } {
  const calls: Array<{ system: string; messages: Array<{ role: string; content: string }> }> = [];
  const author: HyperframesAuthor = async ({ system, messages }) => {
    calls.push({ system, messages: messages.map((m) => ({ ...m })) });
    return replies[calls.length - 1] ?? replies.at(-1)!;
  };
  return { author, calls };
}

// ── A clean first draft ships as-is ──────────────────────────────────────────
{
  const { author, calls } = scriptedAuthor([GOOD]);
  const outcome = await runHyperframesGeneration(REQUEST, author);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.attempts, 1, 'a passing draft must not trigger a repair');
  assert.ok(outcome.ok && outcome.composition.code.includes('useCurrentFrame'));
  assert.equal(outcome.ok && outcome.composition.componentName, 'NeonLowerThird');
  assert.equal(outcome.ok && outcome.composition.durationInFrames, 150, 'the clip length is the caller\'s, not the model\'s');
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.messages[0]!.content, /chef interview/, 'the brief reaches the model');
}

// ── Markdown fences are peeled ───────────────────────────────────────────────
{
  const { author } = scriptedAuthor([`Sure! Here it is:\n\n\`\`\`jsx\n${GOOD}\n\`\`\``]);
  const outcome = await runHyperframesGeneration(REQUEST, author);
  assert.equal(outcome.ok, true, 'a fenced reply must still be accepted');
  assert.ok(outcome.ok && !outcome.composition.code.includes('```'));
}

// ── A failing draft is repaired, and the repair carries the lint errors ──────
{
  const { author, calls } = scriptedAuthor([BAD_WALL_CLOCK, GOOD]);
  const outcome = await runHyperframesGeneration(REQUEST, author);
  assert.equal(outcome.ok, true, 'the second attempt must be accepted');
  assert.equal(outcome.attempts, 2);
  assert.equal(calls.length, 2);
  const repairTurn = calls[1]!.messages;
  assert.equal(repairTurn.length, 3, 'the repair turn keeps brief → draft → errors');
  assert.equal(repairTurn[1]!.role, 'assistant');
  assert.match(
    repairTurn[2]!.content,
    /useCurrentFrame/,
    'the repair message must tell the model the composition never read the host frame',
  );
  assert.match(repairTurn[2]!.content, /Date\.now/, 'and must quote the offending construct');
}

// ── Two repairs, then an honest failure — never a broken composition ─────────
{
  const { author, calls } = scriptedAuthor([BAD_GSAP, BAD_GSAP, BAD_WALL_CLOCK]);
  const outcome = await runHyperframesGeneration(REQUEST, author);
  assert.equal(outcome.ok, false, 'a composition the host cannot run must never be returned as ok');
  assert.equal(outcome.attempts, MAX_HYPERFRAMES_REPAIRS + 1);
  assert.equal(calls.length, MAX_HYPERFRAMES_REPAIRS + 1, 'the loop stops after the configured repairs');
  assert.ok(!outcome.ok && outcome.lastErrors.length > 0, 'the failure reports what was wrong');
}

// ── A provider error surfaces as a failure, not a crash ──────────────────────
{
  const outcome = await runHyperframesGeneration(REQUEST, async () => {
    throw new Error('Anthropic authentication failed.');
  });
  assert.equal(outcome.ok, false);
  assert.equal(!outcome.ok && outcome.error, 'Anthropic authentication failed.');
}

// ── Request validation ───────────────────────────────────────────────────────
{
  assert.equal(parseHyperframesRequest({}), 'prompt is required');
  assert.equal(parseHyperframesRequest({ prompt: '   ' }), 'prompt is required');
  assert.match(String(parseHyperframesRequest({ prompt: 'x'.repeat(9000) })), /at most/);
  const parsed = parseHyperframesRequest({ prompt: ' a title card ', fps: 24, durationInFrames: 3 });
  assert.notEqual(typeof parsed, 'string');
  if (typeof parsed !== 'string') {
    assert.equal(parsed.prompt, 'a title card');
    assert.equal(parsed.fps, 24);
    assert.equal(parsed.width, 1920, 'a missing canvas falls back to 16:9 HD');
    assert.equal(parsed.durationInFrames, HYPERFRAMES_MIN_FRAMES, 'absurdly short clips are clamped up');
  }
  const long = parseHyperframesRequest({ prompt: 'x', durationInFrames: 10_000 });
  assert.equal(typeof long !== 'string' && long.durationInFrames, HYPERFRAMES_MAX_FRAMES);
}

// ── A draft that lints clean but throws is repaired, not shipped ─────────────
// The regex linter cannot see a temporal-dead-zone read; the compile stage can,
// and the repair message has to name it so the model can fix it.
{
  const THROWS = `const Countdown = ({ item }) => {
  const frame = useCurrentFrame();
  const shown = count;
  const count = 5;
  return <AbsoluteFill>{shown}</AbsoluteFill>;
};`;
  const { author, calls } = scriptedAuthor([THROWS, GOOD]);
  const outcome = await runHyperframesGeneration(REQUEST, author);
  assert.equal(outcome.ok, true, 'the repaired draft is the one that ships');
  assert.equal(outcome.attempts, 2);
  assert.match(
    calls[1]!.messages[2]!.content,
    /threw while rendering frame 0/,
    'the repair turn must tell the model the composition crashed, not just that it lints',
  );
  assert.match(calls[1]!.messages[2]!.content, /count/, 'and name what crashed');
}

// ── Configuration detection: keys, local runtimes, and the bundled model ─────
{
  // Nothing configured and no bundled weights: the setup card, with a reason.
  const none = resolveHyperframesLlm(() => '', () => BUILTIN_MISSING, () => true);
  assert.equal(none.configured, false, 'an install with no vendor and no weights has nothing to generate with');
  assert.equal(none.builtin, false);
  assert.equal(none.problem, 'model-missing',
    'a missing model must explain itself in a code the UI can translate, never fail silently');

  // Nothing configured, weights present: zero-setup generation.
  const builtin = resolveHyperframesLlm(() => '', () => BUILTIN_READY, () => true);
  assert.equal(builtin.configured, true, 'a fresh install generates with the model in the installer');
  assert.equal(builtin.builtin, true);
  assert.equal(builtin.provider, BUILTIN_LLM_PROVIDER);
  assert.equal(builtin.modelPath, '/models/builtin.gguf');
  assert.equal(builtin.problem, undefined);
  assert.equal(
    builtin.maxRepairs,
    MAX_BUILTIN_HYPERFRAMES_REPAIRS,
    'the local model gets the extra repair turn; it costs the user nothing',
  );

  // Weights present but the platform has no llama.cpp binary.
  const noRuntime = resolveHyperframesLlm(() => '', () => BUILTIN_READY, () => false);
  assert.equal(noRuntime.configured, false);
  assert.equal(noRuntime.problem, 'runtime-unavailable');

  // An explicit vendor always wins, even with the bundled model sitting there.
  const keyed = resolveHyperframesLlm(
    (name) => (name === 'LLM_PROVIDER' ? 'anthropic' : name === 'LLM_ANTHROPIC_API_KEY' ? 'sk-test' : ''),
    () => BUILTIN_READY,
    () => true,
  );
  assert.equal(keyed.configured, true);
  assert.equal(keyed.provider, 'anthropic');
  assert.equal(keyed.builtin, false, 'a configured vendor is never overridden by the built-in model');
  assert.equal(keyed.maxRepairs, MAX_HYPERFRAMES_REPAIRS);
  assert.ok(keyed.model, 'a provider always resolves to some model id');

  const local = resolveHyperframesLlm(
    (name) => (name === 'LLM_PROVIDER' ? 'ollama' : ''),
    () => BUILTIN_READY,
    () => true,
  );
  assert.equal(local.configured, true, 'a local runtime is configured without an API key');
  assert.equal(local.provider, 'ollama');
  assert.equal(local.builtin, false, 'choosing Ollama means Ollama, not the bundled model');

  // A provider selected but not yet keyed is not a configured provider — the
  // bundled model keeps generation working while the user finds their key.
  const halfConfigured = resolveHyperframesLlm(
    (name) => (name === 'LLM_PROVIDER' ? 'openai' : ''),
    () => BUILTIN_READY,
    () => true,
  );
  assert.equal(halfConfigured.builtin, true);
}

console.log('hyperframes.verify: generation, repair loop, compile stage, validation and provider precedence OK');
