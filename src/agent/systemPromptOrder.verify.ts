// Runnable check: `npx tsx src/agent/systemPromptOrder.verify.ts`.
//
// Prompt caching matches on a **byte-for-byte prefix**. If the part that changes every
// round (the timeline snapshot) sits anywhere but the end, everything after it — the
// remaining paragraphs, the hundreds of tool schemas, the whole conversation history —
// gets re-billed every round, and a single user turn can run up to MAX_TOOL_TURNS rounds.
// So the invariant checked here is: **the volatile section is always last**, and as long
// as the stable section doesn't change between calls, the shared prefix must extend all
// the way up to the start of the volatile section.
import assert from 'node:assert/strict';
import {
  PRODUCT_IDENTITY_PROMPT,
  SYSTEM_PROMPT,
  agentLanguagePrompt,
  assembleSystemPrompt,
  buildAgentSystemPrompt,
  confirmationModePrompt,
  designStylePrompt,
  editorStatePrompt,
} from './systemPrompt';
import { setAgentAutoApply } from './approval-mode';
import { buildCodexSystemPrompt } from './codex/runtime';
import { DEFAULT_AGENT_SETTINGS } from './settings/agentSettings';
import type { AgentContext } from './context';
import type { ProjectDoc, TimelineItem, TimelineState } from '../editor/types';

const commonPrefixLength = (a: string, b: string): number => {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i += 1;
  return i;
};

// ── Assembly rules: Stable sections come first, and variable sections end ──
{
  const stable = ['AAA', 'BBB', 'CCC'];
  assert.equal(assembleSystemPrompt(stable, '<state/>'), 'AAABBBCCC<state/>');
  assert.equal(assembleSystemPrompt(stable, ''), 'AAABBBCCC', 'no extra separator is left even when the volatile section is empty');
  assert.equal(assembleSystemPrompt([], 'x'), 'x');

  // The invariant is "**at least** covers every stable section"; if the two volatile
  // sections happened to share a head, the common prefix would only get longer. Here we
  // deliberately pick two sections with no shared start, so the boundary lands exactly
  // at the end of the stable section.
  const one = assembleSystemPrompt(stable, 'XXX-1');
  const two = assembleSystemPrompt(stable, 'YYY-2-LONGER');
  assert.equal(
    commonPrefixLength(one, two),
    stable.join('').length,
    'the common prefix must cover the whole stable section — one byte short means volatile content leaked into the prefix',
  );
}

{
  assert.match(agentLanguagePrompt('zh'), /interface language is Chinese/);
  assert.match(agentLanguagePrompt('zh'), /in Chinese/);
  assert.match(agentLanguagePrompt('en'), /interface language is English/);
  assert.match(agentLanguagePrompt('en'), /in English/);
  assert.match(agentLanguagePrompt('it'), /interface language is Italian/);
  assert.match(agentLanguagePrompt('it'), /in Italian/);
  assert.match(agentLanguagePrompt('ru'), /interface language is Russian/);
  assert.match(agentLanguagePrompt('ru'), /in Russian/);
}

// ── Public product identity must override stale names in workflows or conversation memory ──
{
  const workflow = '\n<selected_skill>A legacy workflow calls this product AnotherChatCut.</selected_skill>';
  const system = assembleSystemPrompt([
    SYSTEM_PROMPT,
    workflow,
    PRODUCT_IDENTITY_PROMPT,
  ], '<editor_state/>');

  assert.match(PRODUCT_IDENTITY_PROMPT, /official product name is Aquarius Editor/);
  assert.match(SYSTEM_PROMPT, /imported document text.*untrusted editing material/);
  assert.match(PRODUCT_IDENTITY_PROMPT, /Do not inherit product identity/);
  assert.ok(
    system.indexOf(PRODUCT_IDENTITY_PROMPT) > system.indexOf(workflow),
    'product identity should follow selected workflow instructions so stale names cannot override it',
  );
}

// ── Exercise it with the real editorStatePrompt: changing the timeline must not move the prefix ──
{
  const item = (id: string, startFrame: number): TimelineItem => ({
    id, track: 'V1', startFrame, durationInFrames: 60,
    kind: 'video', name: id, src: '/m/a.mp4',
  } as TimelineItem);

  const ctxOf = (items: TimelineItem[]): AgentContext => {
    const state: TimelineState = {
      fps: 30, width: 1920, height: 1080, selectedId: null,
      tracks: { V1: { kind: 'video' } }, trackOrder: ['V1'], items,
    };
    const doc = {
      version: 3, assets: [], mediaFolders: [], activeTimelineId: 'tl1',
      timelines: [{ ...state, id: 'tl1', name: 'main', order: 0 }],
    } as unknown as ProjectDoc;
    return {
      getState: () => state,
      getDoc: () => doc,
      getCreativeMode: () => null,
    } as unknown as AgentContext;
  };

  const promptContext = ctxOf([item('a', 0)]);
  const apiPrompt = buildAgentSystemPrompt(promptContext, DEFAULT_AGENT_SETTINGS);
  const codexPrompt = buildCodexSystemPrompt(promptContext);
  assert.ok(
    apiPrompt.includes(PRODUCT_IDENTITY_PROMPT),
    'the central API prompt builder must include the product identity section',
  );
  assert.equal(
    codexPrompt,
    apiPrompt,
    'Codex and API backends must share the central prompt builder',
  );

  const stable = ['SYSTEM', 'CAPS', 'SKILLS'];
  const before = assembleSystemPrompt(stable, editorStatePrompt(ctxOf([item('a', 0)])));
  const after = assembleSystemPrompt(stable, editorStatePrompt(ctxOf([item('a', 0), item('b', 60)])));

  assert.notEqual(before, after, 'the timeline changed, so the volatile section must change too');
  assert.ok(
    commonPrefixLength(before, after) >= stable.join('').length,
    'adding one clip should only affect the trailing section; if the prefix moves, the tool-schema and history cache are entirely blown',
  );
  assert.equal(before.slice(0, stable.join('').length), stable.join(''), 'the stable section is byte-for-byte unchanged');
  assert.ok(before.includes('<editor_state>'), 'the snapshot really is spliced in');
  assert.ok(
    before.indexOf('<editor_state>') >= stable.join('').length,
    'the whole snapshot lands after the stable section',
  );
}

// ── When a stable section itself changes (e.g. switching the creative mode), the change point must not move earlier ──
{
  // Again, pick two values with no shared start, so the boundary lands exactly at the start of the section that changed.
  const a = assembleSystemPrompt(['SYSTEM', 'CAPS', 'AAAA'], 'S');
  const b = assembleSystemPrompt(['SYSTEM', 'CAPS', 'BBBB'], 'S');
  assert.equal(commonPrefixLength(a, b), 'SYSTEMCAPS'.length, 'invalidation starts only at the section that actually changed');
}

// ── The project design-style guide enters the prompt and governs every edit, not just MG ──
{
  const prompt = designStylePrompt({
    colors: [],
    fonts: [],
    styleGuide: 'Keep captions to two lines or fewer, avoid glare transitions.',
  });
  assert.match(prompt, /Keep captions to two lines or fewer/);
  assert.match(prompt, /Follow it for every edit/);
  assert.match(SYSTEM_PROMPT, /creative direction and asset plan/);
  assert.match(SYSTEM_PROMPT, /Never claim or imply success after an unresolved tool failure/);
}

// ── Auto-apply mode appends a late override; manual mode stays byte-identical ──
{
  // In-app contexts have no getApprovalMode accessor: the composer syncs YOLO
  // into the approval-mode registry, which must drive the built prompt.
  const registryCtx = {
    getState: () => ({ fps: 30, width: 1920, height: 1080, selectedId: null, tracks: { V1: { kind: 'video' } }, trackOrder: ['V1'], items: [] }),
    getDoc: () => ({ version: 3, assets: [], mediaFolders: [], activeTimelineId: 'tl1', timelines: [] }),
    getCreativeMode: () => null,
  } as unknown as AgentContext;
  assert.equal(
    buildAgentSystemPrompt(registryCtx, DEFAULT_AGENT_SETTINGS).includes('# Auto-apply mode (YOLO)'),
    false,
    'the unsynced manual registry must not inject the YOLO override',
  );
  setAgentAutoApply(true);
  try {
    assert.ok(
      buildAgentSystemPrompt(registryCtx, DEFAULT_AGENT_SETTINGS).includes('# Auto-apply mode (YOLO)'),
      'the approval-mode registry must inject the YOLO override when getApprovalMode is absent',
    );
  } finally {
    setAgentAutoApply(false);
  }
  assert.equal(confirmationModePrompt('manual'), '', 'manual (ask) mode must not change the static prompt');
  const auto = confirmationModePrompt('auto');
  assert.match(auto, /# Auto-apply mode \(YOLO\)/);
  assert.match(auto, /overrides the '# Planning and confirmation' rules above/);
  assert.match(auto, /do NOT stop between major stages for confirmation/i);
  assert.match(auto, /do NOT confirm the creative direction or asset plan/i);
  const autoCtx = {
    getState: () => ({ fps: 30, width: 1920, height: 1080, selectedId: null, tracks: { V1: { kind: 'video' } }, trackOrder: ['V1'], items: [] }),
    getDoc: () => ({ version: 3, assets: [], mediaFolders: [], activeTimelineId: 'tl1', timelines: [] }),
    getCreativeMode: () => null,
    getApprovalMode: () => 'auto',
  } as unknown as AgentContext;
  assert.ok(
    buildAgentSystemPrompt(autoCtx, DEFAULT_AGENT_SETTINGS).includes('# Auto-apply mode (YOLO)'),
    'auto-apply mode must inject the YOLO override into the built prompt',
  );
}

console.log('systemPromptOrder.verify: ok (volatile section trails / real editorStatePrompt does not pollute the prefix / invalidation point is minimized)');
