import assert from 'node:assert/strict';
import type { DesignStyle } from '../editor/types';
import { buildDesignStyleRecipe, parseDesignStyleRecipe } from './designStyleTransfer';

const style: DesignStyle = {
  colors: [{ role: ' accent ', value: ' #ff5500 ' }],
  fonts: [{ role: 'heading', family: ' Inter ' }],
  styleGuide: '  Fast pacing, avoid flash-white transitions.  ',
};
const built = buildDesignStyleRecipe('  Social short  ', style, {
  scenarios: [' social ', 'social', 'launch'],
});
const parsed = parseDesignStyleRecipe(JSON.stringify(built));

assert.equal(parsed.name, 'Social short');
assert.deepEqual(parsed.scenarios, ['social', 'launch']);
assert.deepEqual(parsed.style.colors, [{ role: 'accent', value: '#ff5500' }]);
assert.equal(parsed.style.fonts[0]?.family, 'Inter');
assert.equal(parsed.style.styleGuide, 'Fast pacing, avoid flash-white transitions.');

assert.throws(() => parseDesignStyleRecipe('{'), /JSON/);
assert.throws(() => parseDesignStyleRecipe(JSON.stringify({ ...built, version: 2 })), /version/);
assert.throws(() => parseDesignStyleRecipe(JSON.stringify({
  ...built,
  style: { colors: [{ role: 'accent' }], fonts: [] },
})), /Color value is invalid/);

console.log('designStyleTransfer.verify: ok');
