import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ZH } from '../i18n/dict/zh/ui';

const component = await readFile(new URL('./GenerationActivity.tsx', import.meta.url), 'utf8');
const topBarButton = await readFile(new URL('./TopBarIconButton.tsx', import.meta.url), 'utf8');

assert.match(
  component,
  /<TopBarIconButton[\s\S]*?icon="sparkles"[\s\S]*?label=\{t\('Generation Tasks'\)\}/,
  'the generation tasks button must reuse the shared top bar icon button',
);
assert.doesNotMatch(
  component,
  /title=\{t\('Generation Tasks'\)\}/,
  'the generation tasks button must not use the unstyleable native title attribute',
);
assert.match(topBarButton, /className="cc-tip cc-tip-r"/, 'the shared button must use the instant tooltip');
assert.match(topBarButton, /data-tip=\{label\}/, 'the shared button must feed the localized label into the tooltip');
assert.match(topBarButton, /onMouseEnter=/, 'the shared button must provide consistent hover feedback');
assert.match(topBarButton, /onMouseLeave=/, 'the shared button must restore its style when the pointer leaves');
assert.equal(component.match(/retryClassLabel\(job\.retryClass, t\)/g)?.length, 1, 'each task must compute its retry label exactly once');

const generationActivityKeys = [
  'Generation Tasks',
  'Legacy parameter summary (cannot be safely rerun)',
  'Parameter snapshot unavailable',
  'Keep checking, downloading, or rerunning tasks after a refresh',
  'Resuming…',
  'Resume Tasks',
  'Loading tasks…',
  'No generation tasks',
  'Provider task',
  'Open Result',
  'Retry Recoverable Tasks',
  'Check Progress',
  'Pending',
  'Running',
  'Completed',
  'Failed',
  'Not Found',
  'Download Retry Available',
  'Generation Retry Available',
  'Recoverable After Restart',
  'Not Retryable',
  'Legacy Task Status Unknown',
] as const;

for (const key of generationActivityKeys) {
  assert.notEqual(ZH[key], undefined, `the Chinese dictionary must contain "${key}"`);
}

assert.match(component, /t\('\{n\} min ago'/, 'relative minutes must be formatted through i18n');
assert.match(component, /t\('\{n\} hr ago'/, 'relative hours must be formatted through i18n');
assert.match(component, /t\('\{n\} d ago'/, 'relative days must be formatted through i18n');

console.log('generation activity hover and localization verified');
