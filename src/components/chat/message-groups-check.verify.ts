// Runnable check: `npx tsx src/components/chat/message-groups.check.ts`.
// groupMessages collapses consecutive same-named tool lines into a group (>=GROUP_MIN), leaving the rest as-is; verifies collapsing/threshold/order/index.
import assert from 'node:assert/strict';
import type { DisplayMessage } from '../../agent/agent-session';
import { groupMessages, GROUP_MIN } from './message-groups';

const tool = (name: string, id = ''): DisplayMessage => ({ role: 'tool', text: '', tool: { name, args: { id }, result: { ok: true } } });
const txt = (t: string): DisplayMessage => ({ role: 'assistant', text: t });

// 20x edit_gap sandwiched between text and another tool → collapses into one toolgroup, with the text/other tool each on their own line
const msgs: DisplayMessage[] = [
  txt('Start'),
  ...Array.from({ length: 20 }, (_, i) => tool('edit_gap', 'g' + i)),
  tool('read_timeline'),
  txt('Done'),
];
const items = groupMessages(msgs);
assert.deepStrictEqual(items.map((it) => it.kind), ['single', 'toolgroup', 'single', 'single'], '20 consecutive edit_gap collapse into 1 group, text/other tool each on their own line');
const grp = items[1];
assert.ok(grp.kind === 'toolgroup');
assert.strictEqual(grp.kind === 'toolgroup' && grp.name, 'edit_gap');
assert.strictEqual(grp.kind === 'toolgroup' && grp.items.length, 20, 'group contains all 20 occurrences');
assert.strictEqual(grp.kind === 'toolgroup' && grp.items[0].index, 1, 'group retains the original message index (for key/feedback)');
assert.strictEqual(grp.kind === 'toolgroup' && grp.items[19].index, 20);

// Threshold: GROUP_MIN-1 occurrences do not collapse (each its own line), GROUP_MIN occurrences do collapse
const below = groupMessages(Array.from({ length: GROUP_MIN - 1 }, () => tool('search_templates')));
assert.ok(below.every((it) => it.kind === 'single'), `fewer than ${GROUP_MIN} occurrences does not collapse`);
const at = groupMessages(Array.from({ length: GROUP_MIN }, () => tool('search_templates')));
assert.deepStrictEqual(at.map((it) => it.kind), ['toolgroup'], `exactly ${GROUP_MIN} occurrences collapses`);

// Adjacent tools with different names are not merged (information is preserved)
const distinct = groupMessages([tool('clean_script'), tool('read_timeline'), tool('manage_timelines')]);
assert.ok(distinct.every((it) => it.kind === 'single'), 'differently named tools each get their own line, no false collapsing');

// Two same-named runs separated by another tool → two independent groups
const split = groupMessages([...Array.from({ length: 4 }, () => tool('edit_gap')), tool('read_timeline'), ...Array.from({ length: 3 }, () => tool('edit_gap'))]);
assert.deepStrictEqual(split.map((it) => it.kind), ['toolgroup', 'single', 'toolgroup'], 'same-named runs separated by another tool each form their own group');

console.log('message-groups.check: ok (collapsing/threshold/index/no false collapse/splitting)');
