// Library → Hyperframes: the tab exists, the input bar is there, a running
// generation shows as a card, a finished one offers every action, and an install
// with no model configured gets the setup card instead of a dead input.
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MediaAsset } from '../editor/types';
import { HyperframesContext, type HyperframesApi } from './HyperframesContext.tsx';
import { HyperframesPanel } from './HyperframesPanel.tsx';
import { migrateProjectDoc } from '../persist/projectStore.ts';
import { sanitizePortableProjectDoc } from '../persist/portableProject.ts';
import {
  HYPERFRAMES_NOTES_PROP, HYPERFRAMES_REFERENCE_PROP,
  hyperframeAsset, hyperframeNameFromPrompt, hyperframeRecords, hyperframeTemplate,
  isHyperframeAsset, toHyperframeRecord, type PendingHyperframe,
} from './records.ts';

// ── The tab is a main Library tab ────────────────────────────────────────────
const libraryPanelSource = await (await import('node:fs/promises'))
  .readFile(new URL('../library/LibraryPanel.tsx', import.meta.url), 'utf8');
assert.match(
  libraryPanelSource,
  /const MAIN_TABS = \[[^\]]*'Hyperframes'/,
  'Hyperframes must be a main Library tab, beside My Media — not a sub-tab of Library',
);
assert.match(libraryPanelSource, /isHyperframes \? \(\s*<HyperframesPanel \/>/,
  'the tab must render the Hyperframes panel');

// ── Records round-trip through the media pool ────────────────────────────────
const asset = hyperframeAsset({
  id: 'hf-1',
  prompt: 'neon lower third for a chef interview segment',
  code: 'const A = ({ item }) => <AbsoluteFill />;',
  width: 1920,
  height: 1080,
  durationInFrames: 150,
  createdAt: 1_700_000_000_000,
});
assert.equal(asset.kind, 'motion-graphic', 'a generation is stored as an MG pool asset');
assert.equal(asset.src, '', 'it is code-backed: there is no media file');
assert.equal(isHyperframeAsset(asset), true);
assert.equal(asset.name, 'Neon lower third for a chef interview…',
  'the card name is derived from the brief, trimmed on a word boundary');

const unrelated: MediaAsset = {
  id: 'mg-plain', name: 'Agent MG', kind: 'motion-graphic', src: '',
  code: 'const B = ({ item }) => <AbsoluteFill />;', durationInFrames: 60, props: {},
};
assert.equal(isHyperframeAsset(unrelated), false,
  'an MG asset made by the agent tools is not a Hyperframe and must not appear in the tab');

const older = hyperframeAsset({ ...{
  id: 'hf-0', prompt: 'older', code: 'const C = ({ item }) => <AbsoluteFill />;',
  width: 1920, height: 1080, durationInFrames: 60, createdAt: 1_600_000_000_000,
} });
const records = hyperframeRecords([older, unrelated, asset]);
assert.deepEqual(records.map((r) => r.id), ['hf-1', 'hf-0'], 'newest first, non-Hyperframes filtered out');
assert.equal(records[0]!.prompt, 'neon lower third for a chef interview segment');

const template = hyperframeTemplate(records[0]!, 30);
assert.equal(template.id, asset.id,
  'the drag payload keeps the asset id so a placed clip still points back at its pool asset');
assert.equal(template.code, asset.code);
assert.equal(template.durationInFrames, 150);

assert.equal(hyperframeNameFromPrompt(''), 'Hyperframe');
assert.equal(hyperframeNameFromPrompt('a  bold   title'), 'A bold title');

// ── The project package round-trips a generation ─────────────────────────────
// Generations are pool assets, so `.ccproj` export/import carries them with no
// extra transfer code — but only if the boundary functions the package format
// runs a doc through leave the composition and its brief intact.
{
  const doc = migrateProjectDoc({
    version: 1,
    assets: [asset],
    mediaFolders: [],
    timelines: [{
      id: 't1', name: 'Timeline', order: 0,
      fps: 30, width: 1920, height: 1080, items: [], selectedId: null,
    }],
    activeTimelineId: 't1',
  });
  assert.ok(doc, 'a project holding a generation is a valid document');
  const packaged = JSON.parse(JSON.stringify(sanitizePortableProjectDoc(doc)));
  const reopened = migrateProjectDoc(packaged);
  assert.ok(reopened, 'and survives the portable-package boundary');
  const [restored] = hyperframeRecords(reopened.assets);
  assert.ok(restored, 'the generation is still a Hyperframe after import');
  assert.equal(restored.code, asset.code, 'with its composition source intact');
  assert.equal(restored.prompt, 'neon lower third for a chef interview segment', 'and its brief');
  assert.equal(restored.createdAt, 1_700_000_000_000, 'and its timestamp');
}

// ── Panel rendering ──────────────────────────────────────────────────────────
const pending: PendingHyperframe[] = [
  { id: 'run-1', prompt: 'a spinning globe', createdAt: 1, status: 'running' },
  { id: 'run-2', prompt: 'a broken one', createdAt: 2, status: 'failed', error: 'Provider rate limited' },
];

function api(overrides: Partial<HyperframesApi> = {}): HyperframesApi {
  return {
    records,
    pending: [],
    config: {
      configured: true,
      provider: 'anthropic',
      providerLabel: 'Anthropic · Claude',
      model: 'claude-fable-5',
      builtin: false,
    },
    fps: 30,
    generate: () => undefined,
    revise: () => undefined,
    retry: () => undefined,
    dismiss: () => undefined,
    rename: () => undefined,
    placed: new Set<string>(),
    remove: () => true,
    insertAtPlayhead: () => undefined,
    refreshConfig: () => undefined,
    ...overrides,
  };
}

const render = (value: HyperframesApi): string => renderToStaticMarkup(
  <HyperframesContext.Provider value={value}>
    <HyperframesPanel />
  </HyperframesContext.Provider>,
);

const configured = render(api({ pending }));
assert.match(configured, /placeholder="Describe the graphic you want…"/, 'the input bar prompts the user');
assert.match(configured, />Generate<\/button>/, 'a Generate button submits alongside Enter');
assert.match(configured, /data-status="running"/, 'a generation in flight shows as a pending card');
assert.match(configured, />Generating…</, 'and says so');
assert.match(configured, /data-status="failed"/, 'a failed generation stays visible');
assert.match(configured, /Provider rate limited/, 'with the reason it failed');
assert.match(configured, />Retry<\/button>/, 'and a way to run it again');
assert.match(configured, />Regenerate<\/button>/, 'a finished graphic can be re-run as a new item');
assert.match(configured, />Rename<\/button>/);
assert.match(configured, />Delete<\/button>/);
assert.match(configured, /draggable="true"/, 'cards drag onto the timeline');
assert.match(configured, /Neon lower third for a chef interview…/, 'the card is titled from its brief');
assert.doesNotMatch(configured, /Connect a model to generate graphics/,
  'a configured install must not be nagged with the setup card');

const empty = render(api({ records: [] }));
assert.match(empty, /No graphics yet/, 'an empty tab explains both ways to make one');
assert.match(empty, /right-click a timeline track/, 'including the timeline route');

const unconfigured = render(api({
  records: [],
  config: { configured: false, provider: '', providerLabel: '', model: '', builtin: false },
}));
assert.match(unconfigured, /Connect a model to generate graphics/,
  'with no model configured the tab offers the inline setup card');
assert.match(unconfigured, /name="LLM"|<select/, 'the setup card offers a provider picker');
assert.match(unconfigured, /type="password"/, 'and an API key field');

// ── The bundled model: zero setup, with the upgrade folded away ──────────────
const builtin = render(api({
  records: [],
  config: {
    configured: true,
    provider: 'builtin',
    providerLabel: 'Built-in (HyperFrames)',
    model: 'Qwen3 4B Instruct (built in)',
    builtin: true,
  },
}));
assert.doesNotMatch(builtin, /Connect a model to generate graphics/,
  'the model ships inside the app; a fresh install must never be asked to configure one');
assert.doesNotMatch(builtin, /type="password"/,
  'the key field must not be in the way of someone who does not need it');
assert.match(builtin, /use a stronger one/,
  'the upgrade path stays available, one click away');
// The Generate button is still disabled while the field is empty — that is the
// empty-prompt rule, not a configuration gate. The field itself must be live.
assert.doesNotMatch(
  /<input[^>]*>/.exec(builtin)![0],
  /disabled/,
  'the prompt field must be typeable with the built-in model, with nothing configured',
);
assert.match(
  /<input[^>]*>/.exec(unconfigured)![0],
  /disabled/,
  'and it stays disabled when there is genuinely no model to generate with',
);

// ── No local weights says so rather than failing silently ────────────────────
// The installer carries no model — it did not fit under GitHub's 2 GiB
// release-asset limit, see shared/bundled-models.ts — so the app downloads it
// instead. These renders have no server behind them, which is exactly the case
// where `HyperframesSetup` cannot learn whether a download is possible: it must
// degrade to the provider card rather than offer a download it cannot promise.
const missingWeights = render(api({
  records: [],
  config: {
    configured: false,
    provider: 'anthropic',
    providerLabel: 'Anthropic · Claude',
    model: 'claude-fable-5',
    builtin: false,
    problem: 'model-missing',
  },
}));
assert.match(missingWeights, /has not been downloaded yet/,
  'having no local weights must be explained, never presented as an unconfigured app');
assert.match(missingWeights, /Connect a model to generate graphics/,
  'and the setup card must come back as the way out');

// A download already under way is a "nearly there", not a fault: the copy must
// point at waiting as a real option, not only at connecting something else.
const downloadingWeights = render(api({
  records: [],
  config: {
    configured: false,
    provider: 'anthropic',
    providerLabel: 'Anthropic · Claude',
    model: 'claude-fable-5',
    builtin: false,
    problem: 'model-downloading',
  },
}));
assert.match(downloadingWeights, /still downloading/,
  'a model on its way must never be reported as a missing one');
assert.doesNotMatch(
  /<input[^>]*>/.exec(downloadingWeights)![0],
  /disabled/,
  'the prompt bar stays live during the download — a 2.3 GB wait behind a dead '
  + 'input reads as a broken tab; pressing Generate answers "still downloading" instead',
);

const corruptWeights = render(api({
  records: [],
  config: {
    configured: false,
    provider: 'anthropic',
    providerLabel: 'Anthropic · Claude',
    model: 'claude-fable-5',
    builtin: false,
    problem: 'model-corrupt',
  },
}));
assert.match(corruptWeights, /wrong size/, 'a half-copied weight file names its own symptom');
assert.match(unconfigured, /disabled=""/, 'the prompt input is disabled until a model exists');

// Loading state (config not yet known) must not flash the setup card.
const loading = render(api({ records: [], config: null }));
assert.doesNotMatch(loading, /Connect a model to generate graphics/,
  'the setup card must not flash before the server has answered');


// ── Revision fields are optional, so old records still load ──────────────────
// A generation saved before revisions existed carries neither prop. Reading one
// must produce a valid record with no origin, not a broken card.
{
  const legacy = hyperframeAsset({
    id: 'hf-legacy',
    prompt: 'an older graphic',
    code: 'const D = ({ item }) => <AbsoluteFill />;',
    width: 1920,
    height: 1080,
    durationInFrames: 90,
    createdAt: 1_500_000_000_000,
  });
  assert.equal(HYPERFRAMES_REFERENCE_PROP in (legacy.props ?? {}), false,
    'an ordinary generation must not gain empty revision props');
  assert.equal(HYPERFRAMES_NOTES_PROP in (legacy.props ?? {}), false);
  const legacyRecord = toHyperframeRecord(legacy);
  assert.ok(legacyRecord, 'a record with no revision fields is still a valid Hyperframe');
  assert.equal(legacyRecord.referenceId, undefined);
  assert.equal(legacyRecord.notes, undefined);

  // A record whose props hold junk instead of strings degrades to "no origin"
  // rather than rendering it.
  const junk = toHyperframeRecord({
    ...legacy,
    props: { ...legacy.props, [HYPERFRAMES_REFERENCE_PROP]: 42, [HYPERFRAMES_NOTES_PROP]: null },
  });
  assert.ok(junk);
  assert.equal(junk.referenceId, undefined, 'a non-string reference id is ignored');
  assert.equal(junk.notes, undefined);

  const derived = hyperframeAsset({
    id: 'hf-2',
    prompt: 'neon lower third for a chef interview segment',
    code: 'const E = ({ item }) => <AbsoluteFill />;',
    width: 1920,
    height: 1080,
    durationInFrames: 150,
    createdAt: 1_700_000_100_000,
    referenceId: 'hf-1',
    notes: 'make it orange',
  });
  const derivedRecord = toHyperframeRecord(derived)!;
  assert.equal(derivedRecord.referenceId, 'hf-1', 'a revision remembers what it came from');
  assert.equal(derivedRecord.notes, 'make it orange', 'and what was asked for');

  // And it survives the project package boundary like everything else.
  const doc = migrateProjectDoc({
    version: 1,
    assets: [asset, derived],
    mediaFolders: [],
    timelines: [{
      id: 't1', name: 'Timeline', order: 0,
      fps: 30, width: 1920, height: 1080, items: [], selectedId: null,
    }],
    activeTimelineId: 't1',
  });
  const reopened = migrateProjectDoc(JSON.parse(JSON.stringify(sanitizePortableProjectDoc(doc!))))!;
  const restored = hyperframeRecords(reopened.assets).find((record) => record.id === 'hf-2')!;
  assert.equal(restored.referenceId, 'hf-1', 'the origin survives export and import');
  assert.equal(restored.notes, 'make it orange');
}

// ── A revised card says where it came from ───────────────────────────────────
{
  const derived = hyperframeAsset({
    id: 'hf-2',
    prompt: 'an orange lower third',
    code: 'const F = ({ item }) => <AbsoluteFill />;',
    width: 1920,
    height: 1080,
    durationInFrames: 150,
    createdAt: 1_700_000_100_000,
    referenceId: 'hf-1',
    notes: 'make it orange',
  });
  const withRevision = render(api({ records: hyperframeRecords([asset, derived]) }));
  assert.match(withRevision, /Revised from Neon lower third for a chef interview…/,
    'a revision names the graphic it was derived from');
  assert.match(withRevision, /make it orange/, 'and shows the notes it was made with');

  // The origin can have been deleted; the card must still say it is a revision.
  const orphan = render(api({ records: hyperframeRecords([derived]) }));
  assert.match(orphan, /Revised from an earlier graphic/,
    'a revision whose original is gone still reads as a revision');
}

// ── A revision in flight is labelled while it runs ───────────────────────────
{
  const running = render(api({
    records: [],
    pending: [{
      id: 'run-3',
      prompt: 'an orange lower third',
      createdAt: 3,
      status: 'running',
      reference: { id: 'hf-1', name: 'Neon lower third', prompt: 'neon', code: 'const G = () => null;' },
      notes: 'make it orange',
    }],
  }));
  assert.match(running, /Revised from Neon lower third/);
  assert.match(running, /make it orange/);
}

// ── Deleting: confirm first, and never while a clip uses the graphic ─────────
{
  // Nothing on the timeline: Delete is armed by the first click, not applied.
  const deletable = render(api());
  assert.match(deletable, />Delete<\/button>/, 'an unused graphic offers Delete');
  assert.doesNotMatch(deletable, /Confirm Delete/,
    'the confirm step only appears once the first click has armed it');
  assert.doesNotMatch(deletable, /used by a clip on the timeline/);

  // Placed on the timeline: the delete is refused with a reason, because
  // removing the pool asset would take the clip with it.
  const inUse = render(api({ placed: new Set(['hf-1']) }));
  assert.match(inUse, /used by a clip on the timeline/,
    'a placed graphic explains why it cannot be deleted');
  assert.match(inUse, /Delete the clip first/, 'and says what to do about it');
  assert.match(inUse, /disabled=""/, 'the Delete button itself is not live');

  // The rule is enforced in the API, not only drawn in the UI.
  const host = { removed: [] as string[] };
  const guarded = api({
    placed: new Set(['hf-1']),
    remove: (record) => {
      if (record.id === 'hf-1') return false;
      host.removed.push(record.id);
      return true;
    },
  });
  assert.equal(guarded.remove(records[0]!), false, 'deleting a placed generation is refused');
  assert.deepEqual(host.removed, [], 'and nothing is removed');
  assert.equal(guarded.remove(records[1]!), true, 'an unplaced one still deletes');
}

// ── Regenerate opens the revise prompt rather than re-running the brief ──────
{
  const panelSource = await (await import('node:fs/promises'))
    .readFile(new URL('./HyperframesPanel.tsx', import.meta.url), 'utf8');
  assert.match(panelSource, /<HyperframesPromptPopup/,
    'Regenerate must open the prompt popup, not silently re-run the same brief');
  assert.match(panelSource, /initialPrompt=\{revising\.record\.prompt\}/,
    'pre-filled with the original brief, editable');
  assert.match(panelSource, /hyperframes\.revise\(/,
    'and submitting goes through revise, which keeps the original');
}

console.log('hyperframes-library.verify: tab, input bar, pending/failed cards, revisions, delete rules and setup card OK');
