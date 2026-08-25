import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync(new URL('./MediaPoolPanel.tsx', import.meta.url), 'utf8');
const grid = readFileSync(new URL('./MediaPoolGrid.tsx', import.meta.url), 'utf8');
const card = readFileSync(new URL('./MediaPoolCard.tsx', import.meta.url), 'utf8');

assert.match(panel, /setFavoritesOnly\(true\)/, 'the favorites entry point must switch into the favorites view');
assert.match(panel, /favoritesOnly \? ` \/ \$\{t\('Favorites'\)\}`/, 'the favorites view must show a breadcrumb the user can navigate back from');
assert.match(grid, /kind: 'favorites'/, 'the virtual asset grid must include a favorites entry type');
assert.match(grid, /cc-folder-card cc-favorites-folder/, 'the favorites entry must reuse the folder card visuals');
assert.match(card, /className="cc-asset-favorite"/, 'every asset card must provide a favorite button');
assert.match(card, /aria-pressed=\{!!asset\.favorite\}/, 'the favorite button must expose its current state');
assert.match(card, /onSetFavorite\(asset\.id, !asset\.favorite\)/, 'the favorite button must toggle the asset\'s favorite field');
assert.doesNotMatch(card, /cc-asset-check/, 'the favorite star should replace the redundant selection checkbox');

console.log('media-favorites-folder.verify: folder and card favorite controls are wired');
