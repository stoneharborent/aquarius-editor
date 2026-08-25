import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const exportHistory = await readFile(new URL('./ExportHistory.tsx', import.meta.url), 'utf8');

assert.match(
  exportHistory,
  /<TopBarIconButton[\s\S]*?icon="download"[\s\S]*?label=\{t\('Export History'\)\}/,
  'the Export History button should reuse the top-bar icon button',
);
assert.doesNotMatch(
  exportHistory,
  /<button title=\{t\('Export History'\)\}/,
  'the Export History button should not use a native title (its styling cannot be controlled)',
);

console.log('top bar immediate tooltips verified');
