import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const testLocaleId = '\0asset-menu-destinations-test-locale';
const vite = await createServer({
  appType: 'custom',
  plugins: [{
    name: 'asset-menu-destinations-test-locale',
    enforce: 'pre',
    resolveId(id) {
      return id.endsWith('/i18n/locale') || id.endsWith('/i18n/locale.ts') ? testLocaleId : null;
    },
    load(id) {
      if (id !== testLocaleId) return null;
      return `
        export const t = (text, params) => params
          ? text.replace(/\\{(\\w+)\\}/g, (match, key) => key in params ? String(params[key]) : match)
          : text;
        export const useT = () => t;
      `;
    },
  }],
  server: { middlewareMode: true },
});

try {
  const { AssetMenuDestinations } = await vite.ssrLoadModule(
    '/src/media/AssetMenuDestinations.tsx',
  ) as typeof import('./AssetMenuDestinations');
  const { BlankMediaMenuActions } = await vite.ssrLoadModule(
    '/src/media/MediaPoolOverlays.tsx',
  ) as typeof import('./MediaPoolOverlays');
  const { runAssetDestinationAction } = await vite.ssrLoadModule(
    '/src/media/assetDestination.ts',
  ) as typeof import('./assetDestination');
  const { assetMenuSelectionIds, assetMenuFavoriteValue, batchAssetRename, duplicateAssetName } = await vite.ssrLoadModule(
    '/src/media/assetMenuSelection.ts',
  ) as typeof import('./assetMenuSelection');

  const calls: string[] = [];
  const actions = { timeline: () => calls.push('timeline') };

  runAssetDestinationAction('timeline', actions);
  assert.deepEqual(calls, ['timeline']);
  assert.deepEqual(
    assetMenuSelectionIds('asset-b', new Set(['asset-a', 'asset-b']), ['asset-a', 'asset-b', 'asset-c']),
    ['asset-a', 'asset-b'],
    'right-clicking an already-selected asset must keep the whole multi-selection',
  );
  assert.equal(duplicateAssetName('Project Media.mp4', 'copy'), 'Project Media copy.mp4');
  assert.equal(duplicateAssetName('No Extension', 'copy'), 'No Extension copy');
  assert.deepEqual(
    assetMenuSelectionIds('asset-c', new Set(['asset-a', 'asset-b']), ['asset-a', 'asset-b', 'asset-c']),
    ['asset-c'],
    'right-clicking an unselected asset must only act on that asset',
  );
  assert.equal(
    assetMenuFavoriteValue([{ favorite: true }, { favorite: false }]),
    true,
    'bulk favorite should favorite everything as long as at least one is not yet favorited',
  );
  assert.equal(
    assetMenuFavoriteValue([{ favorite: true }, { favorite: true }]),
    false,
    'bulk unfavorite should only happen when everything is already favorited',
  );
  assert.deepEqual(
    batchAssetRename([
      { id: 'asset-a', name: 'original.mp4' },
      { id: 'asset-b', name: 'cover.png' },
    ], 'Project Media'),
    [
      { id: 'asset-a', name: 'Project Media.mp4' },
      { id: 'asset-b', name: 'Project Media 2.png' },
    ],
    'batch rename must preserve each asset\'s extension and add a stable sequence number to subsequent assets',
  );

  const markup = renderToStaticMarkup(createElement(AssetMenuDestinations, {
    assetName: 'july-7.mp4',
    onAddTimeline: () => undefined,
  }));

  assert.match(markup, /Add to:/);
  assert.match(markup, />Timeline</);
  assert.doesNotMatch(markup, /AI chat/, 'the in-app chat destination is gone');
  assert.match(markup, /aria-label="Add july-7\.mp4 to timeline"/);

  // A document asset has no timeline destination, so the whole row disappears.
  const documentMarkup = renderToStaticMarkup(createElement(AssetMenuDestinations, {
    assetName: 'script.md',
  }));
  assert.equal(documentMarkup, '', 'with no destination left the row must not render an empty shell');

  const blankMenuMarkup = renderToStaticMarkup(createElement(BlankMediaMenuActions, {
    clipboardCount: 2,
    visibleCount: 3,
    allVisibleSelected: false,
    view: 'grid',
    sort: 'newest',
    type: 'all',
    onPaste: () => undefined,
    onSelectAll: () => undefined,
    onUpload: () => undefined,
    onSemanticSearch: () => undefined,
    onMobileUpload: () => undefined,
    onCreateFolder: () => undefined,
    onViewToggle: () => undefined,
    onSort: () => undefined,
    onType: () => undefined,
  }));
  assert.match(blankMenuMarkup, /Paste copies \(2\)/);
  assert.match(blankMenuMarkup, />Select all</);
  assert.match(blankMenuMarkup, />Upload media</);
  assert.match(blankMenuMarkup, />Local semantic search</);
  assert.match(blankMenuMarkup, />Upload from phone</);
  assert.match(blankMenuMarkup, />New folder</);
  assert.match(blankMenuMarkup, /aria-label="Sort media"/);
  assert.match(blankMenuMarkup, /aria-label="Filter media"/);

  const overlaySource = await readFile(new URL('./MediaPoolOverlays.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(overlaySource, /className="cc-asset-menu-backdrop"/, 'the asset menu should not use a full-screen backdrop that blocks directly right-clicking another asset');
  assert.match(overlaySource, /document\.addEventListener\('pointerdown', closeOutside, true\)/, 'the asset menu should close via an outside click');
} finally {
  await vite.close();
}

console.log('asset menu destinations verified');
