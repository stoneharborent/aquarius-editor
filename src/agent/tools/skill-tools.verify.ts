// Runnable self-check: `npx tsx src/agent/tools/skill-tools.check.ts`
// manage_skill's current / activate (creative mode dump and switch) contract: current's two states (empty/set),
// activate validates id + lands via ctx.setCreativeMode + empty string clears, host missing the setter errors.
// Custom skill CRUD goes through IDB (browser-only); under node, refresh silently skips — this only verifies built-in skills.
import assert from 'node:assert';
import { execSkillTool, SKILL_TOOL_NAMES, SKILL_TOOL_SCHEMAS } from './skill-tools';
import { CREATIVE_SKILLS } from '../skills/skills-catalog';
import type { AgentContext } from '../context';

assert.ok(SKILL_TOOL_NAMES.has('manage_skill'));
const actions = (SKILL_TOOL_SCHEMAS[0].input_schema as unknown as { properties: { action: { enum: string[] } } }).properties.action.enum;
for (const a of ['list', 'get', 'current', 'activate', 'create', 'update', 'delete']) {
  assert.ok(actions.includes(a), `schema should include action ${a}`);
}

// fake host: a readable/writable creative-mode slot
let mode: string | null = null;
const ctx = {
  getCreativeMode: () => mode,
  setCreativeMode: (id: string | null) => { mode = id; },
} as unknown as AgentContext;

const builtinId = CREATIVE_SKILLS[0]?.id ?? null;

// ---- current: nothing selected -> active:null ----
{
  const r = await execSkillTool('manage_skill', { action: 'current' }, ctx) as { active: unknown; note?: string };
  assert.strictEqual(r.active, null, 'no mode selected should return active:null');
  assert.ok(r.note?.includes('No creative mode'), 'should include a not-selected note');
}

// ---- activate a built-in skill -> lands + returns brief; current reads back the same one ----
// (Under node, getPluginSkill uses Vite `?raw` and can't reach the built-in file -> CREATIVE_SKILLS is empty,
// so the built-in activation assertions are skipped, only verifying the management contract doesn't crash in the empty state.)
if (builtinId) {
  const r = await execSkillTool('manage_skill', { action: 'activate', skillId: builtinId }, ctx) as {
    ok?: boolean; active?: { id: string; builtin: boolean }; note?: string;
  };
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.active?.id, builtinId);
  assert.strictEqual(r.active?.builtin, true, 'built-in skill should be marked builtin');
  assert.ok(r.note?.includes('next message'), 'should explain injection timing (system prompt is built once per runAgent)');
  assert.strictEqual(mode, builtinId, 'ctx.setCreativeMode should be called');

  const cur = await execSkillTool('manage_skill', { action: 'current' }, ctx) as { active: { id: string } };
  assert.strictEqual(cur.active.id, builtinId, 'current should read back the activated mode');

  const unknown = await execSkillTool('manage_skill', { action: 'activate', skillId: 'skill_nope' }, ctx) as { error?: string };
  assert.ok(unknown.error?.includes('no skill'), 'unknown id should error');
  assert.strictEqual(mode, builtinId, 'an error should not change the current mode');
}

// ---- activate empty string -> clears ----
{
  const r = await execSkillTool('manage_skill', { action: 'activate', skillId: '' }, ctx) as { ok?: boolean; active?: unknown };
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.active, null);
  assert.strictEqual(mode, null, 'empty string should clear the mode');
}

// ---- host has no setter (legacy check-style ctx) -> clear error ----
{
  const bare = { getCreativeMode: () => null } as unknown as AgentContext;
  const r = await execSkillTool('manage_skill', { action: 'activate', skillId: builtinId ?? 'skill_any' }, bare) as { error?: string };
  assert.ok(r.error, 'a host without setCreativeMode should error instead of silently no-oping');
}

console.log('skill-tools.check: ALL PASSED');
