// Runnable check: `npx tsx src/agent/settings/agent-settings.verify.ts`.
// Verification: settings default value/persistence roundtrip, <agent_settings> injection (tier and planMode branches),
// Inline <thinking> extract state machine (single chunk/cross-chunk/unclosed/nested text/half label).
import assert from 'node:assert/strict';
import {
  AGENT_CACHE_MODES, DEFAULT_AGENT_SETTINGS, loadAgentSettings, saveAgentSettings,
  agentSettingsPrompt, createInlineThinkingExtractor,
  MG_TIERS,
} from './agentSettings';

// ── Default value (node has no localStorage → load uses catch/empty storage, return to default in both cases) ──
assert.deepStrictEqual(loadAgentSettings(), DEFAULT_AGENT_SETTINGS, 'no storage -> default value');
assert.strictEqual(DEFAULT_AGENT_SETTINGS.mgTier, 'balance', 'mgTier defaults to balance');
assert.strictEqual(DEFAULT_AGENT_SETTINGS.planMode, false, 'planMode defaults to false');
assert.strictEqual(DEFAULT_AGENT_SETTINGS.cacheMode, 'short', 'cacheMode defaults to short');
assert.strictEqual(DEFAULT_AGENT_SETTINGS.autonomousAcceptance, false, 'autonomous acceptance defaults to off, keeping existing user behavior unchanged');
assert.strictEqual(DEFAULT_AGENT_SETTINGS.maxAcceptanceIterations, 3, 'autonomous acceptance defaults to at most 3 rounds');
assert.deepStrictEqual([...AGENT_CACHE_MODES], ['short', 'long']);
assert.deepStrictEqual([...MG_TIERS], ['speed', 'balance', 'quality']);

// ── Persistence roundtrip (map version localStorage mock) ──
const store = new Map<string, string>();
// defineProperty: compatible with the localStorage accessor that comes with newer nodes (direct assignment may be rejected)
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  },
});
saveAgentSettings({
  mgTier: 'quality', planMode: true, cacheMode: 'long', serverRun: false,
  autonomousAcceptance: true, maxAcceptanceIterations: 5,
});
assert.deepStrictEqual(
  loadAgentSettings(),
  {
    mgTier: 'quality', planMode: true, cacheMode: 'long', serverRun: true,
    autonomousAcceptance: true, maxAcceptanceIterations: 5,
  },
  'save→load roundtrip is faithful (server-side execution is always on)',
);
// Removed settings from older storage must not leak back into the active settings shape.
store.set('cc.agentSettings.v1', JSON.stringify({ skillGuard: true, thinkingEnabled: true, mgTier: 'speed', planMode: false }));
assert.deepStrictEqual(
  loadAgentSettings(),
  {
    mgTier: 'speed', planMode: false, cacheMode: 'short', serverRun: true,
    autonomousAcceptance: false, maxAcceptanceIterations: 3,
  },
  'the old thinkingEnabled field is ignored and the new cache field safely falls back (server-side execution stays on)',
);
// Illegal tier / Missing fields fall back to default
store.set('cc.agentSettings.v1', JSON.stringify({ mgTier: 'ludicrous' }));
assert.strictEqual(loadAgentSettings().mgTier, 'balance', 'an illegal tier falls back to balance');

// ── <agent_settings> injection ──
const off = agentSettingsPrompt({ mgTier: 'speed', planMode: false });
assert.ok(off.includes('<agent_settings>') && off.includes('</agent_settings>'), 'wrapped in tags');
assert.ok(off.includes('motion_graphic_tier=speed'), 'contains the tier key/value');
assert.ok(off.includes('--tier speed'), 'contains the pass --tier wording');
assert.ok(!off.includes('plan_mode'), 'planMode off -> no plan instruction');
const on = agentSettingsPrompt({ mgTier: 'quality', planMode: true });
assert.ok(on.includes('motion_graphic_tier=quality') && on.includes('--tier quality'), 'tier follows the setting');
assert.ok(on.includes('plan_mode=on') && on.includes('numbered plan'), 'planMode on -> plan-before-acting instruction');

// ── Inline <thinking> extract state machine ──
const run = (chunks: string[]) => {
  const ex = createInlineThinkingExtractor();
  let text = '';
  let thinking = '';
  for (const c of chunks) {
    const r = ex.push(c);
    text += r.text;
    thinking += r.thinking;
  }
  const f = ex.flush();
  return { text: text + f.text, thinking: thinking + f.thinking };
};

// Single chunk complete label
assert.deepStrictEqual(run(['before<thinking>internal reasoning</thinking>after']), { text: 'beforeafter', thinking: 'internal reasoning' }, 'single-chunk extraction');
// Unlabeled passthrough (including "<" not mistaken for a tag)
assert.deepStrictEqual(run(['plain text, a < b is also unaffected']), { text: 'plain text, a < b is also unaffected', thinking: '' }, 'no tag passthrough');
// Across chunks: opening/closing tags are split
assert.deepStrictEqual(run(['start<thi', 'nking>inner ', 'thoughts</thin', 'king>end']), { text: 'startend', thinking: 'inner thoughts' }, 'tag split across chunks');
// Not closed: all remaining balance at the end of the stream returns to thinking
assert.deepStrictEqual(run(['a<thinking>unclosed thinking']), { text: 'a', thinking: 'unclosed thinking' }, 'unclosed falls into thinking');
// Unclosed + half-closed tags also belong to thinking
assert.deepStrictEqual(run(['<thinking>x</thin']), { text: '', thinking: 'x</thin' }, 'a half-closed tag with no closing falls into thinking');
// The half-cut label finally becomes a label → normal text
assert.deepStrictEqual(run(['price <think']), { text: 'price <think', thinking: '' }, 'a half-open tag is plain text');
// Nested text: Leave other tags in thinking as they are, and restore the text after closing.
assert.deepStrictEqual(run(['A<thinking>x <b>nested</b> y</thinking>B']), { text: 'AB', thinking: 'x <b>nested</b> y' }, 'a nested tag stays inside thinking');
// Multiple paragraphs of thinking alternate
assert.deepStrictEqual(run(['<thinking>one</thinking>foo<thinking>two</thinking>bar']), { text: 'foobar', thinking: 'onetwo' }, 'multiple alternating segments');
// Reappear in thinking <thinking> literal: no re-entry, enter thinking as it is
assert.deepStrictEqual(run(['<thinking>outer<thinking>inner</thinking>after']), { text: 'after', thinking: 'outer<thinking>inner' }, 'no re-entry');
// ── <think> variants (DeepSeek/MiniMax/GLM/Qwen/MiMo series) have the same rules as <thinking> ──
assert.deepStrictEqual(run(['before<think>internal reasoning</think>after']), { text: 'beforeafter', thinking: 'internal reasoning' }, '<think> single-chunk extraction');
assert.deepStrictEqual(run(['a<thi', 'nk>in', 'ner</th', 'ink>b']), { text: 'ab', thinking: 'inner' }, '<think> tag split across chunks');
assert.deepStrictEqual(run(['a<think>unclosed thinking']), { text: 'a', thinking: 'unclosed thinking' }, '<think> unclosed falls into thinking');
// Two tags in the same stream alternate without crosstalk.
assert.deepStrictEqual(run(['<think>one</think>foo<thinking>two</thinking>bar']), { text: 'foobar', thinking: 'onetwo' }, 'both tags alternate');
// The closing tag is paired with the opening tag: the </thinking> literal within the <think> block does not close the block
assert.deepStrictEqual(run(['<think>a</thinking>b</think>c']), { text: 'c', thinking: 'a</thinking>b' }, 'a closing tag pairs with its matching opening tag');

console.log('agent-settings.verify: ok (defaults/roundtrip/injection branches/extraction state machine)');
