// The composition contract has three readers that must agree, or a generated
// graphic dies somewhere between the model and the timeline:
//   1. src/template-host.ts — what the sandbox actually injects and rejects.
//   2. shared/hyperframes-contract.ts — what the lint enforces.
//   3. shared/hyperframes-prompt.ts — what the model is told.
// This asserts all three describe the same host.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  clampHyperframesDuration,
  HYPERFRAMES_ALLOWED_GLOBALS,
  HYPERFRAMES_MAX_FRAMES,
  HYPERFRAMES_MIN_FRAMES,
  HYPERFRAMES_TIME_HOOK,
  lintHyperframesComposition,
  stripCodeFences,
} from './hyperframes-contract';
import { hyperframesRepairPrompt, hyperframesSystemPrompt, hyperframesUserPrompt } from './hyperframes-prompt';

const hostSource = readFileSync(
  fileURLToPath(new URL('../src/template-host.ts', import.meta.url)),
  'utf8',
);

// ── 1. The advertised globals are the ones the sandbox injects ───────────────
const whitelist = /const WHITELIST: Record<string, unknown> = \{([\s\S]*?)\n\};/.exec(hostSource);
assert.ok(whitelist, 'template-host must still declare a WHITELIST of injected globals');
const injected = new Set(
  whitelist[1]!
    .split(/[,\n]/)
    .map((entry) => entry.split(':')[0]!.trim())
    .filter(Boolean),
);
for (const name of HYPERFRAMES_ALLOWED_GLOBALS) {
  assert.ok(
    injected.has(name),
    `the contract advertises "${name}" but template-host does not inject it`,
  );
}

// ── 2. Everything the contract advertises is also in the prompt ──────────────
const system = hyperframesSystemPrompt();
for (const name of HYPERFRAMES_ALLOWED_GLOBALS) {
  assert.ok(system.includes(name), `the system prompt never mentions the injected global "${name}"`);
}
assert.ok(
  system.includes(HYPERFRAMES_TIME_HOOK),
  'the system prompt must name the host time hook — host-driven time is the whole scrubbing contract',
);
assert.match(
  system,
  /scrub/i,
  'the system prompt must say WHY time comes from the host (scrubbing), not just that it does',
);
assert.doesNotMatch(system, /\bGSAP is available\b/i, 'GSAP is not available in this host');

// ── 3. The example in the prompt is itself a passing composition ─────────────
const exampleMatch = /(const LowerThirdSweep[\s\S]*?\n};)/.exec(system);
assert.ok(exampleMatch, 'the system prompt must carry a worked example');
const exampleLint = lintHyperframesComposition(exampleMatch[1]!);
assert.deepEqual(
  exampleLint.errors,
  [],
  `the prompt's own example must pass the lint it teaches: ${exampleLint.errors.join('; ')}`,
);
assert.equal(exampleLint.name, 'LowerThirdSweep');

// ── 4. The lint rejects exactly what the sandbox would reject ────────────────
const good = `const Card = ({ item }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const o = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity: o }}>{item.props.title}{durationInFrames}</AbsoluteFill>;
};`;
assert.equal(lintHyperframesComposition(good).ok, true, 'a plain host-driven composition must pass');
assert.equal(lintHyperframesComposition(good).name, 'Card');

const rejected: Array<[string, RegExp]> = [
  [good.replace('const frame = useCurrentFrame();', 'const frame = 0;'), /useCurrentFrame/],
  [`import gsap from 'gsap';\n${good}`, /import statement/],
  [good.replace('interpolate(frame', 'fetch("https://x.dev") && interpolate(frame'), /fetch\(\)|external URL/],
  [good.replace('interpolate(frame', 'window.foo && interpolate(frame'), /window access/],
  [good.replace('interpolate(frame', 'setTimeout(() => {}, 1) && interpolate(frame'), /timers/],
  [good.replace('interpolate(frame', 'Date.now() && interpolate(frame'), /Date\.now/],
  [good.replace('interpolate(frame', 'Math.random() && interpolate(frame'), /Math\.random/],
  ['const Card = () => <AbsoluteFill />;', /no entry point/],
  ['', /empty/],
];
for (const [source, expected] of rejected) {
  const result = lintHyperframesComposition(source);
  assert.equal(result.ok, false, `should have been rejected: ${source.slice(0, 48)}…`);
  assert.ok(
    result.errors.some((error) => expected.test(error)),
    `expected an error matching ${String(expected)}, got: ${result.errors.join('; ')}`,
  );
}

// A composition that passes the lint must also survive the sandbox blocklist.
const forbiddenInHost = /const FORBIDDEN: \[RegExp, string\]\[\] = \[([\s\S]*?)\n\];/.exec(hostSource);
assert.ok(forbiddenInHost, 'template-host must still declare its FORBIDDEN blocklist');
for (const line of forbiddenInHost[1]!.split('\n')) {
  const pattern = /^\s*\[(\/.*\/[a-z]*),/.exec(line);
  if (!pattern) continue;
  const [, body, flags] = /^\/(.*)\/([a-z]*)$/.exec(pattern[1]!)!;
  assert.equal(
    new RegExp(body!, flags).test(good.replace(/\/\/[^\n]*/g, ' ')),
    false,
    `a lint-clean composition trips the sandbox rule ${pattern[1]}`,
  );
}

// ── 5. Fences, repair prompt, duration clamp ─────────────────────────────────
assert.equal(stripCodeFences('```jsx\nconst A = 1;\n```'), 'const A = 1;');
assert.equal(stripCodeFences('Here you go:\n```\nconst A = 1;\n```'), 'const A = 1;');
assert.equal(stripCodeFences('  const A = 1;  '), 'const A = 1;');

const repair = hyperframesRepairPrompt(['forbidden construct: window access']);
assert.match(repair, /window access/, 'the repair prompt must quote the lint errors verbatim');

const user = hyperframesUserPrompt({
  prompt: 'a neon title card', width: 1080, height: 1920, fps: 30, durationInFrames: 90,
});
assert.match(user, /a neon title card/);
assert.match(user, /1080x1920/, 'the brief must carry the project canvas');
assert.match(user, /90 frames/, 'the brief must carry the clip length in frames');
assert.match(user, /~3\.0s/, 'the brief must also state the length in seconds');

assert.equal(clampHyperframesDuration(90, 150), 90);
assert.equal(clampHyperframesDuration(1, 150), HYPERFRAMES_MIN_FRAMES);
assert.equal(clampHyperframesDuration(999_999, 150), HYPERFRAMES_MAX_FRAMES);
assert.equal(clampHyperframesDuration('nope', 150), 150);

console.log('hyperframes-contract.verify: host, lint and authoring prompt agree');
