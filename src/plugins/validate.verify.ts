// Plugin package validation + def mapping + zoom envelope evaluation. npx tsx src/plugins/validate.check.ts
import assert from 'node:assert/strict';
import { validatePack, validateItem } from './validate';
import { fxDefOf, lutDefOf, transitionDefOf } from './store';
import { PLUGIN_FORMAT, PLUGIN_LIMITS, pluginAssetId, type PluginPack } from './types';
import { sampleEnvelope, zoomAt } from '../editor/zoom';
import { reduce } from '../editor/reduce';
import type { TimelineItem, TimelineState } from '../editor/types';

const FX_FRAG = 'uniform sampler2D u_input;\nvoid main(){ /* … */ }';
const TR_FRAG = 'uniform sampler2D u_outgoing;\nuniform sampler2D u_incoming;\nuniform float u_progress;\nvoid main(){}';
const CUBE_2 = ['LUT_3D_SIZE 2', '0 0 0', '1 0 0', '0 1 0', '1 1 0', '0 0 1', '1 0 1', '0 1 1', '1 1 1'].join('\n');

const goodPack: PluginPack = {
  format: PLUGIN_FORMAT,
  id: 'demo-pack',
  name: 'Demo pack',
  version: '1.0.0',
  author: 'tester',
  items: [
    { type: 'mg-template', id: 'title-card', name: 'Title Card', width: 1920, height: 1080, code: 'const T = () => null;' },
    { type: 'transition', id: 'ink', name: 'Ink', frag: TR_FRAG, props: [{ key: 'softness', label: 'Softness', default: 0.3, min: 0, max: 1 }] },
    { type: 'fx', id: 'vhs', name: 'VHS', frag: FX_FRAG },
    { type: 'lut', id: 'moody', name: 'Moody', cube: CUBE_2 },
    { type: 'zoom', id: 'elastic', name: 'Elastic', envelope: [0, 0.6, 1.1, 1], magnification: 1.6 },
  ],
};

// ── A well-formed pack passes everything ────────────────────────────────────
{
  const res = validatePack(goodPack);
  assert.ok(res.ok, `well-formed pack should pass: ${res.ok ? '' : res.errors.join('; ')}`);
}

// ── Malicious/broken packs are rejected, one category at a time ─────────────
const rejects: Array<[string, unknown]> = [
  ['not an object', 'not-an-object'],
  ['wrong format', { ...goodPack, format: 'evil@9' }],
  ['bad pack id', { ...goodPack, id: 'Bad_ID!' }],
  ['bad version', { ...goodPack, version: 'v1' }],
  ['empty items', { ...goodPack, items: [] }],
  ['too many entries', { ...goodPack, items: Array.from({ length: PLUGIN_LIMITS.maxItems + 1 }, (_, i) => ({ type: 'zoom', id: `z-${i}`, name: 'z', envelope: [0, 1] })) }],
  ['duplicate entry id', { ...goodPack, items: [goodPack.items[4], goodPack.items[4]] }],
  ['unknown type', { ...goodPack, items: [{ type: 'malware', id: 'x', name: 'x' }] }],
  ['fx missing u_input', { ...goodPack, items: [{ type: 'fx', id: 'x', name: 'x', frag: 'void main(){}' }] }],
  ['fx frag too large', { ...goodPack, items: [{ type: 'fx', id: 'x', name: 'x', frag: `uniform sampler2D u_input;${'/*x*/'.repeat(20000)}` }] }],
  ['transition missing u_progress', { ...goodPack, items: [{ type: 'transition', id: 'x', name: 'x', frag: 'uniform sampler2D u_outgoing; uniform sampler2D u_incoming;' }] }],
  ['invalid prop key', { ...goodPack, items: [{ type: 'fx', id: 'x', name: 'x', frag: FX_FRAG, props: [{ key: 'bad key', label: 'x', default: 0, min: 0, max: 1 }] }] }],
  ['too many props', { ...goodPack, items: [{ type: 'fx', id: 'x', name: 'x', frag: FX_FRAG, props: Array.from({ length: PLUGIN_LIMITS.maxProps + 1 }, (_, i) => ({ key: `k${i}`, label: 'x', default: 0, min: 0, max: 1 })) }] }],
  ['1D LUT', { ...goodPack, items: [{ type: 'lut', id: 'x', name: 'x', cube: 'LUT_1D_SIZE 2\n0 0 0\n1 1 1' }] }],
  ['broken cube data', { ...goodPack, items: [{ type: 'lut', id: 'x', name: 'x', cube: 'LUT_3D_SIZE 2\n0 0' }] }],
  ['too few envelope points', { ...goodPack, items: [{ type: 'zoom', id: 'x', name: 'x', envelope: [1] }] }],
  ['envelope value out of range', { ...goodPack, items: [{ type: 'zoom', id: 'x', name: 'x', envelope: [0, 99] }] }],
  ['zoom magnification out of range', { ...goodPack, items: [{ type: 'zoom', id: 'x', name: 'x', envelope: [0, 1], magnification: 99 }] }],
  ['mg code missing', { ...goodPack, items: [{ type: 'mg-template', id: 'x', name: 'x', code: '' }] }],
  ['thumb has an illegal scheme', { ...goodPack, items: [{ type: 'zoom', id: 'x', name: 'x', envelope: [0, 1], thumb: 'javascript:alert(1)' }] }],
  ['thumb too large', { ...goodPack, items: [{ type: 'zoom', id: 'x', name: 'x', envelope: [0, 1], thumb: `data:image/jpeg;base64,${'A'.repeat(PLUGIN_LIMITS.maxThumbBytes + 64)}` }] }],
];
{
  const withThumb = validatePack({ ...goodPack, items: [{ type: 'zoom', id: 'zx', name: 'x', envelope: [0, 1], thumb: 'data:image/jpeg;base64,AAAA' }, { type: 'fx', id: 'fy', name: 'y', frag: FX_FRAG, thumb: '/plugins/t.jpg' }] });
  assert.ok(withThumb.ok, `data/URL thumb should pass: ${withThumb.ok ? '' : withThumb.errors.join(';')}`);
}
for (const [label, bad] of rejects) {
  const res = validatePack(bad);
  assert.ok(!res.ok, `${label} should be rejected`);
}
assert.ok(validateItem({ type: 'fx', id: 'ok', name: 'ok', frag: FX_FRAG }).length === 0, 'validateItem passes a well-formed single entry');
console.log(`validatePack: well-formed pack passes + all ${rejects.length} broken-pack categories rejected OK`);

// ── def mapping: asset id namespacing + shapes ──────────────────────────────
{
  const fx = fxDefOf(goodPack, goodPack.items[2] as never);
  assert.equal(fx.id, 'plugin:demo-pack/vhs');
  assert.equal(fx.frag, FX_FRAG);
  const lut = lutDefOf(goodPack, goodPack.items[3] as never, '/media/uploads/demo-pack-moody.cube', 'LUTFRAG');
  assert.equal(lut.id, 'plugin:demo-pack/moody');
  assert.equal(lut.cube, '/media/uploads/demo-pack-moody.cube');
  assert.equal(lut.frag, 'LUTFRAG');
  assert.equal(lut.props[0].key, 'intensity');
  const tr = transitionDefOf(goodPack, goodPack.items[1] as never);
  assert.equal(tr.id, 'plugin:demo-pack/ink');
  assert.equal(tr.label, 'Ink');
  assert.equal(pluginAssetId('a', 'b'), 'plugin:a/b');
  console.log('def mapping OK');
}

// ── zoom envelope evaluation: linear sampling + overshoot + precedence ──────
{
  assert.equal(sampleEnvelope([0, 1], 0.5), 0.5, 'two-point linear midpoint');
  assert.equal(sampleEnvelope([0, 1, 0], 0.25), 0.5, 'three-point first-segment midpoint');
  assert.equal(sampleEnvelope([0.4], 0.9), 0.4, 'a single point is a constant');
  const z = { envelope: [0, 1], magnification: 2 };
  assert.equal(zoomAt(z, 0, 61).magnification, 1, 'envelope start = no zoom');
  assert.equal(zoomAt(z, 60, 61).magnification, 2, 'envelope end = full magnification');
  const over = zoomAt({ envelope: [0, 1.5], magnification: 2 }, 60, 61).magnification;
  assert.ok(Math.abs(over - 2.5) < 1e-9, `overshoot envelope should magnify to 2.5, got ${over}`);
  // When shape and envelope both exist, envelope wins (a plugin curve is an explicit choice)
  const both = zoomAt({ envelope: [1, 1], shape: 'zoom-out', magnification: 2 }, 0, 61).magnification;
  assert.equal(both, 2, 'envelope overrides shape');
  console.log('zoom envelope OK');
}

// ── reduce setEffects: def snapshots land in state.fxDefs, shared across the undo chain ──
{
  const base: TimelineState = {
    fps: 30, width: 1920, height: 1080, selectedId: null,
    items: [{ id: 'a', track: 'V1', startFrame: 0, durationInFrames: 60, kind: 'video', name: 'a', src: '/a.mp4' } as TimelineItem],
  };
  const def = { id: 'plugin:demo-pack/vhs', name: 'VHS', desc: 'x', frag: FX_FRAG, props: [] };
  const s1 = reduce(base, { type: 'setEffects', id: 'a', effects: [{ id: 'e1', assetId: def.id }], defs: [def] });
  assert.equal(s1.fxDefs?.[def.id]?.frag, FX_FRAG, 'the def lands in state.fxDefs');
  assert.equal(s1.items[0].effects?.[0]?.assetId, def.id);
  const s2 = reduce(s1, { type: 'setEffects', id: 'a', effects: [] });
  assert.equal(s2.fxDefs?.[def.id]?.frag, FX_FRAG, 'removing an effect does not clear defs (safe for undo/re-attach)');
  assert.equal(s2.items[0].effects, undefined);
  console.log('reduce fxDefs OK');
}

// ── Export as plugin: candidate collection (prefix/dedup) + pack reassembly ids + full-pack validation ──
{
  const { fxCandidates, transitionCandidates, mgCandidates, buildExportPack } = await import('./export');
  const fx = fxCandidates([
    { id: 'custom:fx-a', name: 'A', desc: 'x', frag: FX_FRAG, props: [] },
    { id: 'plugin:other/b', name: 'Someone else\'s', desc: 'x', frag: FX_FRAG, props: [] },   // never export someone else's content
    { id: 'builtin:fx-invert', name: 'Built-in', desc: 'x', frag: FX_FRAG, props: [] }, // never export built-ins
    { id: 'custom:fx-a', name: 'A', desc: 'x', frag: FX_FRAG, props: [] },        // deduped
  ]);
  assert.equal(fx.length, 1, 'fx candidates only take custom: entries, and dedupe');
  const trs = transitionCandidates(
    [{ id: 'custom:tr-x', label: 'Registry transition', frag: TR_FRAG, props: [] }],
    [
      { id: 't1', type: 'custom-shader', durationInFrames: 30, outgoingItemId: 'a', incomingItemId: 'b', trackId: 'V1', customFrag: TR_FRAG, customLabel: 'Same frag' },
      { id: 't2', type: 'custom-shader', durationInFrames: 30, outgoingItemId: 'b', incomingItemId: 'c', trackId: 'V1', customFrag: TR_FRAG + '\n// v2', customUniforms: { u_soft: 0.3 }, customLabel: 'Timeline transition' },
      { id: 't3', type: 'cross-dissolve', durationInFrames: 30, outgoingItemId: 'c', incomingItemId: 'd', trackId: 'V1' },
    ],
  );
  assert.equal(trs.length, 2, 'registry + orphaned timeline frag, same frag deduped, built-in transitions excluded');
  const mgs = mgCandidates([
    { id: 'm1', track: 'V1', startFrame: 0, durationInFrames: 60, name: 'Card', kind: 'motion-graphic', code: 'const A = () => null;' },
    { id: 'm2', track: 'V1', startFrame: 60, durationInFrames: 60, name: 'Card', kind: 'motion-graphic', code: 'const A = () => null;' },
    { id: 'v1', track: 'V1', startFrame: 120, durationInFrames: 60, name: 'Video', kind: 'video', src: '/a.mp4' },
  ] as TimelineItem[]);
  assert.equal(mgs.length, 1, 'MG dedupes by code; non-MG entries are excluded');
  const built = buildExportPack({ id: 'my-pack', name: 'My pack' }, [fx[0].item, trs[0].item, trs[1].item, mgs[0].item]);
  assert.ok(built.ok, `the assembled pack should pass validation: ${built.ok ? '' : built.errors.join(';')}`);
  if (built.ok) {
    assert.deepEqual(built.pack.items.map((i) => i.id), ['fx-1', 'tr-1', 'tr-2', 'mg-1'], 'ids are reassigned uniquely by type');
    assert.equal(built.pack.version, '1.0.0');
  }
  const badId = buildExportPack({ id: 'Bad Id!', name: 'x' }, [fx[0].item]);
  assert.ok(!badId.ok, 'a bad pack id is rejected');
  console.log('export pack assembly OK');
}

// ── propSchema validation + sha256Hex + unregister (registry side only) ─────
{
  const mg = (extra: Record<string, unknown>) => ({ ...goodPack, items: [{ type: 'mg-template', id: 'mg-x', name: 'x', code: 'const T = () => null;', ...extra }] });
  assert.ok(validatePack(mg({ propSchema: [{ key: 'title', type: 'text', label: 'Title' }] })).ok, 'a well-formed propSchema passes');
  assert.ok(!validatePack(mg({ propSchema: 'nope' })).ok, 'a non-array propSchema is rejected');
  assert.ok(!validatePack(mg({ propSchema: [{ key: 1, type: 'text' }] })).ok, 'a non-string key is rejected');
  assert.ok(!validatePack(mg({ propSchema: Array.from({ length: 33 }, (_, i) => ({ key: `k${i}`, type: 'text' })) })).ok, 'more than 32 entries is rejected');

  const { sha256Hex, installFromText } = await import('./install');
  const hex = await sha256Hex('openchatcut');
  assert.match(hex, /^[0-9a-f]{64}$/, 'sha256Hex outputs a 64-char lowercase hex string');
  assert.equal(hex, await sha256Hex('openchatcut'), 'stable for the same text');
  const mismatch = await installFromText('{}', { sha256: 'f'.repeat(64) });
  assert.ok(!mismatch.ok && mismatch.errors[0].includes('SHA-256'), 'a hash mismatch is refused before parsing');

  const { registerCustomTransition, getCustomTransition, unregisterCustomTransition, __resetCustomTransitions } = await import('../gl/customTransitions');
  registerCustomTransition({ id: 'plugin:p/t', label: 't', frag: TR_FRAG, props: [] });
  assert.ok(getCustomTransition('plugin:p/t'), 'visible once registered');
  assert.equal(unregisterCustomTransition('plugin:p/t'), true, 'unregister returns true');
  assert.equal(getCustomTransition('plugin:p/t'), undefined, 'not visible after unregistering');
  assert.equal(unregisterCustomTransition('plugin:p/t'), false, 'unregistering again returns false');
  __resetCustomTransitions();

  const { registerCustomZoom, getCustomZoom, unregisterCustomZoom, __resetCustomZooms } = await import('../editor/customZooms');
  registerCustomZoom({ id: 'plugin:p/z', label: 'z', envelope: [0, 1] });
  assert.ok(getCustomZoom('plugin:p/z'));
  assert.equal(unregisterCustomZoom('plugin:p/z'), true);
  assert.equal(getCustomZoom('plugin:p/z'), undefined, 'zoom not visible after unregistering');
  __resetCustomZooms();
  console.log('propSchema/sha256/unregister OK');
}

console.log('\nplugins/validate.check: ALL PASSED');
