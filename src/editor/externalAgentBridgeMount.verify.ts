// Source contract: the editor shell — not a chat panel — owns the MCP browser
// binding. `useExternalAgentBridge` is what registers this editor's tools with
// the external-agent broker (POST /api/external-agent/register) and then polls
// for calls, so if it stops being mounted from the editor controller, external
// agents silently lose browser mode. There is no in-app chat left to mount it,
// which is exactly why this is asserted here.
//
// Runnable check: `npx tsx src/editor/externalAgentBridgeMount.verify.ts`
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const controller = source('./useEditorController.tsx');
const workspace = source('./EditorWorkspaceView.tsx');
const overlay = source('../components/external/ExternalAgentOverlay.tsx');

// 1. The bridge hook is imported and called by the editor controller itself, so
//    it runs for the whole lifetime of an open project.
assert.match(
  controller,
  /import \{ useExternalAgentBridge \} from '\.\.\/agent\/useExternalAgentBridge'/,
  'the editor controller must import the external-agent bridge hook',
);
assert.match(
  controller,
  /useExternalAgentBridge\(agent\.agentCtx, props\.project\.id\)/,
  'the bridge must be bound to the live editor AgentContext and the open project id',
);

// 2. The hook call is unconditional — no `if`/`&&`/`?:` guard on the line.
const call = controller.split('\n').find((line) => line.includes('useExternalAgentBridge('));
assert.ok(call, 'the bridge hook call must exist');
assert.match(
  call,
  /^\s*const externalAgent = useExternalAgentBridge\(/,
  'the bridge hook must be called unconditionally, never behind a panel/visibility guard',
);

// 3. Its controller reaches the view, which mounts the surface that lets a user
//    answer an external agent's proposal and live-project confirmations.
assert.match(
  controller,
  /externalAgentOverlay: \{ external: environment\.externalAgent, onPreviewState: setPreviewState \}/,
  'the external bridge controller must be handed to the workspace view',
);
assert.match(
  workspace,
  /<ExternalAgentOverlay \{\.\.\.props\.externalAgentOverlay\} \/>/,
  'the workspace view must render the external-agent overlay',
);
assert.match(overlay, /ExternalProposalCard/, 'the overlay renders the external proposal/guard card');

// 4. The in-app chat is gone and must not come back through this seam.
assert.equal(
  existsSync(fileURLToPath(new URL('../components/chat', import.meta.url))),
  false,
  'src/components/chat was removed with the agent window',
);
for (const [name, text] of [['controller', controller], ['workspace view', workspace]] as const) {
  assert.doesNotMatch(text, /ChatPanel|chatPanel|chatCollapsed|chatSeed/, `${name} must not reference the removed chat panel`);
}

console.log('externalAgentBridgeMount.verify: the editor shell owns the MCP browser binding');
