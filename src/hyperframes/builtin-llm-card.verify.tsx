// The card that stands in for "Hyperframes has nothing to generate with" —
// every state it can be in, rendered.
//
// The point of these assertions is the promise the feature makes: someone who
// opens the tab on a fresh install is told what is happening and how far along
// it is, is never trapped waiting for it, and is never asked twice after saying
// no. A card that silently renders nothing, or renders a dead button, breaks
// that quietly, which is exactly the kind of thing a render test catches.
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { BuiltinLlmDownloadCard } from './BuiltinLlmDownloadCard.tsx';
import {
  builtinLlmDownloadPercent,
  formatDownloadSize,
  type BuiltinLlmDownloadState,
} from '../../shared/builtin-llm-download.ts';

const TOTAL = 2_497_281_120;
const BASE: BuiltinLlmDownloadState = {
  status: 'absent',
  bytesDone: 0,
  bytesTotal: TOTAL,
  label: 'Qwen3 4B Instruct (built in)',
  declined: false,
  autoStart: true,
  runtimeAvailable: true,
};

const noop = () => undefined;
function render(state: BuiltinLlmDownloadState, busy = false): string {
  return renderToStaticMarkup(
    <BuiltinLlmDownloadCard
      state={state}
      busy={busy}
      onStart={noop}
      onPause={noop}
      onDecline={noop}
      onUseOwnModel={noop}
    />,
  );
}

// ── The size is quoted the way a person reads a download ─────────────────────
assert.equal(formatDownloadSize(TOTAL), '2.5 GB');
assert.equal(formatDownloadSize(400_000_000), '400 MB');
assert.equal(formatDownloadSize(0), '0 MB');

// ── Nothing downloaded yet: an offer with a size on it ───────────────────────
{
  const markup = render(BASE);
  assert.match(markup, /Download built-in model \(2\.5 GB\)/,
    'the offer must say how much of someone\'s connection it will spend');
  assert.match(markup, /Not now/, 'declining is offered, not hidden');
  assert.match(markup, /Use your own model instead/,
    'the provider route is available from the first frame, not only after a failure');
  assert.doesNotMatch(markup, /role="progressbar"/, 'no progress bar before there is progress');
}

// ── Downloading: the headline carries the real percentage ────────────────────
{
  const state = { ...BASE, status: 'downloading' as const, bytesDone: Math.round(TOTAL * 0.43) };
  assert.equal(builtinLlmDownloadPercent(state), 43);
  const markup = render(state);
  assert.match(markup, /Setting up the built-in graphics model \(2\.5 GB\) — 43%/,
    'the card states what it is doing, how big it is, and how far along');
  assert.match(markup, /role="progressbar"/);
  assert.match(markup, /aria-valuenow="43"/, 'the bar is readable by a screen reader too');
  assert.match(markup, /width:43%/, 'and the fill matches the number');
  assert.match(markup, />Pause</, 'a 2.5 GB download must always be stoppable');
  assert.match(markup, /Use your own model instead/,
    'waiting must never be the only option while it runs');
  assert.doesNotMatch(markup, />Not now</,
    'a running download offers Pause; a second refusal button beside it is noise');
}

// ── Paused: resuming, and honest that nothing is lost ────────────────────────
{
  const markup = render({ ...BASE, status: 'paused', bytesDone: Math.round(TOTAL * 0.6) });
  assert.match(markup, /Built-in graphics model — paused at 60%/);
  assert.match(markup, /Resume download/);
  assert.match(markup, /continues from where it stopped/,
    'the copy has to say the 60% is kept, or Resume looks like Start over');
  assert.match(markup, /role="progressbar"/, 'a paused download still shows where it got to');
}

// ── Declined: still offered by hand, never nagged ────────────────────────────
{
  const markup = render({ ...BASE, declined: true });
  assert.match(markup, /Download built-in model \(2\.5 GB\)/,
    'a decline hides the automatic download, not the button');
  assert.doesNotMatch(markup, />Not now</,
    'someone who already said no is not asked to say it again');
  assert.match(markup, /Use your own model instead/);
}

// ── Failed: what went wrong, and a retry that is safe to press ───────────────
{
  const markup = render({
    ...BASE,
    status: 'error',
    bytesDone: 0,
    error: 'model download failed integrity verification',
  });
  assert.match(markup, /could not be downloaded/);
  assert.match(markup, /model download failed integrity verification/,
    'the real reason is shown, not a generic apology');
  assert.match(markup, /Nothing was kept from the failed attempt/,
    'a checksum failure discards the file, and the card says so');
  assert.match(markup, /Try again/);
  assert.match(markup, /data-status="error"/);
}

// ── Ready: the card is gone ──────────────────────────────────────────────────
{
  assert.equal(
    render({ ...BASE, status: 'ready', bytesDone: TOTAL }),
    '',
    'once the weights are here the card disappears entirely — the same tab a '
    + 'bundled model would have produced',
  );
}

// ── Busy: buttons cannot be double-fired ─────────────────────────────────────
{
  const markup = render({ ...BASE, status: 'downloading', bytesDone: 10 }, true);
  assert.match(markup, /disabled=""/, 'an in-flight mutation disables its own button');
}

// ── The unconfigured surfaces route through the shared setup component ───────
const read = async (path: string): Promise<string> => (await import('node:fs/promises'))
  .readFile(new URL(path, import.meta.url), 'utf8');
for (const [file, what] of [
  ['./HyperframesPanel.tsx', 'the Library tab'],
  ['./HyperframesPromptPopup.tsx', 'the timeline prompt popup'],
] as const) {
  const source = await read(file);
  assert.match(source, /<HyperframesSetup\b/,
    `${what} must offer the built-in download, not jump straight to the provider form`);
}
const setup = await read('./HyperframesSetup.tsx');
assert.match(setup, /runtimeAvailable/,
  'a build with no local runtime must fall through to the provider card, never dangle a download it cannot run');
assert.doesNotMatch(setup, /problem !== 'model-corrupt'/,
  'a damaged weight file is repaired by downloading it again — routing that case to '
  + 'the API-key form would answer a question the user did not ask');

console.log('builtin-llm-card.verify: offer, progress, pause, decline, failure and completion render OK');
