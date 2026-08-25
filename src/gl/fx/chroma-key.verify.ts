// Standalone self-check for the chroma-key (color key) effect.
// Does not import effects.ts — its `.frag?raw` import relies on Vite's raw-loader, which bare
// `npx tsx` can't resolve (it would try to parse .frag as JS and error). As in fx.check.ts, this
// manually mirrors FX_EFFECTS['builtin:fx-chroma-key']'s id/props (must stay in sync with effects.ts),
// and reads the frag source directly with fs to verify the contract against the text.
// Run with: npx tsx src/gl/fx/chroma-key.check.ts
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fxUniforms, type FxDef } from './uniforms';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mirrors the 'builtin:fx-chroma-key' entry in effects.ts
const chromaKey: FxDef = {
  id: 'builtin:fx-chroma-key', name: 'Chroma Key / Green Screen', desc: '', frag: '',
  props: [
    { key: 'keyColor', label: '', kind: 'color', default: [0, 1, 0], uniform: 'u_keyColor' },
    { key: 'similarity', label: '', default: 0.18, min: 0, max: 0.6 },
    { key: 'smoothness', label: '', default: 0.08, min: 0.001, max: 0.4 },
    { key: 'spill', label: '', default: 0.5, min: 0, max: 1 },
  ],
};

// 1) Default uniform mapping: numeric props go through u_<key>, the color prop goes through an explicit uniform override
assert.deepStrictEqual(fxUniforms(chromaKey), {
  u_keyColor: [0, 1, 0],
  u_similarity: 0.18,
  u_smoothness: 0.08,
  u_spill: 0.5,
}, 'chroma-key default uniform mapping');

// 2) Out-of-range overrides are clamped to [min,max] (color is clamped per-channel to [0,1])
assert.deepStrictEqual(
  fxUniforms(chromaKey, { similarity: 99, smoothness: -1, spill: 2, keyColor: [2, -1, 0.5] }),
  { u_keyColor: [1, 0, 0.5], u_similarity: 0.6, u_smoothness: 0.001, u_spill: 1 },
  'out-of-range overrides are clamped',
);

// 3) Frag source contract: stays aligned with the uniform names bound by runtime.ts renderFx
const frag = readFileSync(join(__dirname, 'chroma-key.frag'), 'utf8');
assert.ok(frag.includes('#version 300 es'), 'declares GLSL 300 es');
assert.ok(frag.includes('uniform sampler2D u_input'), 'references u_input (the input texture bound by renderFx)');
assert.ok(frag.includes('in vec2 v_texCoord'), 'declares the v_texCoord varying (provided by the vertex shader)');
assert.ok(/\bvoid\s+main\s*\(/.test(frag), 'declares main()');
assert.ok(/\bout\s+vec4\s+fragColor\b/.test(frag), 'declares out vec4 fragColor');
assert.ok(frag.includes('fragColor ='), 'writes fragColor inside main');

// The uniform name for each prop key (uniform ?? u_<key>) must actually be declared in the frag,
// otherwise the runtime's setUniform can't get a location and the effect silently does nothing.
for (const p of chromaKey.props) {
  const uniformName = p.uniform ?? `u_${p.key}`;
  assert.ok(frag.includes(uniformName), `frag declares ${uniformName} (matching props.${p.key})`);
}

console.log('chroma-key.check: ok');
