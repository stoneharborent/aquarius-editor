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
  hyperframeAsset, hyperframeNameFromPrompt, hyperframeRecords, hyperframeTemplate,
  isHyperframeAsset, type PendingHyperframe,
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
    regenerate: () => undefined,
    retry: () => undefined,
    dismiss: () => undefined,
    rename: () => undefined,
    remove: () => undefined,
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

console.log('hyperframes-library.verify: tab, input bar, pending/failed cards, item actions and setup card OK');
