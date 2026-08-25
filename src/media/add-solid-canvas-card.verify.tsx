import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { AddSolidCanvasCard } from './AddSolidCanvasCard';

const markup = renderToStaticMarkup(
  <AddSolidCanvasCard label="Add solid background/canvas" onAdd={() => undefined} />,
);

assert.match(
  markup,
  /class="cc-add-solid-canvas-card"/,
  'the first slot in the media grid should provide an "Add solid background/canvas" shortcut card',
);
assert.match(markup, />Add solid background\/canvas</, 'the shortcut card should display a clear action name');
assert.match(markup, /aria-label="Add solid background\/canvas"/, 'the whole card should be an accessible add action');

console.log('add-solid-canvas-card.verify: first-grid action card OK');
