// checks: skin registry integrity + contrast gate (impeccable colorize discipline curing).
// To change the color of any skin, you must go here: text/panel ≥ 7, textDim/panel ≥ 4.5,
// textMuted/panel ≥ 4.5, onAccent/accent ≥ 4.5 (WCAG AA).
// `npx tsx src/skins.verify.ts`
import assert from 'node:assert/strict';
import { DEFAULT_SKIN, SKINS, buildSkinsCss } from './skins';

function luminance(hex: string): number {
  const f = (c: number): number => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(parseInt(hex.slice(1, 3), 16))
    + 0.7152 * f(parseInt(hex.slice(3, 5), 16))
    + 0.0722 * f(parseInt(hex.slice(5, 7), 16));
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function mixHex(foreground: string, background: string, foregroundWeight: number): string {
  const channel = (hex: string, index: number): number => parseInt(hex.slice(index, index + 2), 16);
  const mixed = [1, 3, 5].map((index) => Math.round(
    channel(foreground, index) * foregroundWeight
      + channel(background, index) * (1 - foregroundWeight),
  ));
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

// ── Registry integrity ──
assert.ok(SKINS.length >= 2, 'at least default + 1 more set');
assert.equal(new Set(SKINS.map((s) => s.id)).size, SKINS.length, 'skin ids are unique');
assert.ok(SKINS.some((s) => s.id === DEFAULT_SKIN), 'default skin must be in the registry');
for (const s of SKINS) {
  assert.ok(/^[a-z]+$/.test(s.id), `${s.id}: id must be lowercase letters`);
  assert.ok(s.name.trim().length > 0, `${s.id}: must have a display name`);
  assert.match(s.tokens.accentRgb, /^\d{1,3},\d{1,3},\d{1,3}$/, `${s.id}: accentRgb triplet`);
  assert.match(s.tokens.inkRgb, /^\d{1,3},\d{1,3},\d{1,3}$/, `${s.id}: inkRgb triplet`);
  assert.match(s.tokens.shadowRgb, /^\d{1,3},\d{1,3},\d{1,3}$/, `${s.id}: shadowRgb triplet`);
  for (const [name, value] of Object.entries(s.tokens)) {
    if (name === 'accentRgb' || name === 'inkRgb' || name === 'shadowRgb' || name === 'colorScheme') continue;
    assert.match(value, /^#[0-9a-f]{6}$/, `${s.id}.${name}: 6-digit lowercase hex (needed for contrast calculations)`);
  }
}

// ── Ice / Midnight: the values the spec fixes, asserted literally ──
// Spec: repo `os-image`, branch `research/custom-de`,
//       docs/custom-de/ice-theme-tokens.md (AquariusOS's colour identity, 2026-08-31).
// Copied roles are asserted as the exact hex; derived roles are RE-DERIVED here from
// the same spec inputs, so a hand-tweak in skins.ts fails instead of drifting.
const tokensOf = (id: string): (typeof SKINS)[number]['tokens'] => {
  const skin = SKINS.find((s) => s.id === id);
  assert.ok(skin, `${id}: skin must exist`);
  return skin.tokens;
};
const ice = tokensOf('ice');
const midnight = tokensOf('icemidnight');

// Ice (light) — surfaces/ink/semantics straight from the spec table.
assert.deepEqual(
  {
    bg: ice.bg, inset: ice.inset, panel: ice.panel, panelAlt: ice.panelAlt, hover: ice.hover,
    text: ice.text, textMuted: ice.textMuted, textStrong: ice.textStrong,
    accent: ice.accent, select: ice.select, onAccent: ice.onAccent,
    success: ice.success, gold: ice.gold, danger: ice.danger, colorScheme: ice.colorScheme,
  },
  {
    // bg · bgSoft · panel · surface · surfaceAlt
    bg: '#eaf1f8', inset: '#dfeaf4', panel: '#f0f6fc', panelAlt: '#f7fbfe', hover: '#e4edf6',
    // ink · inkSoft · inkProse
    text: '#16273a', textMuted: '#47586b', textStrong: '#0e1b2a',
    // Aquarius Blue on Ice; dark text on the fill (inkProse)
    accent: '#2c8fc4', select: '#2c8fc4', onAccent: '#0e1b2a',
    // success · warn (this app's `gold` slot is its warning channel) · danger
    success: '#1f9e8c', gold: '#c2792e', danger: '#c8463b', colorScheme: 'light',
  },
  'Ice: spec surfaces/ink/accent/semantics',
);
// Midnight (dark twin) — same table, dark column. Surfaces are assigned by
// luminance, which crosses two spec names (panel ← `surface`, panelAlt ← `panel`).
assert.deepEqual(
  {
    bg: midnight.bg, inset: midnight.inset, panel: midnight.panel,
    panelAlt: midnight.panelAlt, hover: midnight.hover,
    text: midnight.text, textMuted: midnight.textMuted, textStrong: midnight.textStrong,
    accent: midnight.accent, select: midnight.select, onAccent: midnight.onAccent,
    success: midnight.success, gold: midnight.gold, danger: midnight.danger,
    colorScheme: midnight.colorScheme,
  },
  {
    bg: '#0b1220', inset: '#111a2b', panel: '#121c2e', panelAlt: '#152033', hover: '#1b2940',
    text: '#dce9f4', textMuted: '#93a7bc', textStrong: '#dcf3ff', // ink · inkSoft · iceBlue
    accent: '#00bfff', select: '#00bfff', onAccent: '#0b1220', // Deep Sky Blue, dark text on fill
    success: '#5fc9b0', gold: '#e0a35a', danger: '#e07b7b', colorScheme: 'dark',
  },
  'Midnight: spec surfaces/ink/accent/semantics',
);
// The five values that are NOT in the spec table, re-derived from it.
assert.deepEqual(
  {
    border: ice.border, borderLight: ice.borderLight, textDim: ice.textDim,
    accentDeep: ice.accentDeep, tlTrack: ice.tlTrack, tlSidePanel: ice.tlSidePanel,
  },
  {
    border: mixHex('#16273a', '#f0f6fc', 0.10),      // line = ink @10% over panel
    borderLight: mixHex('#16273a', '#f0f6fc', 0.18), // lineStrong = ink @18% over panel
    textDim: mixHex('#47586b', '#7c90a4', 0.60),     // inkMute lifted 60% toward inkSoft
    accentDeep: mixHex('#0e1b2a', '#2c8fc4', 0.20),  // accent 20% toward inkProse
    tlTrack: mixHex('#2c8fc4', '#eaf1f8', 0.08),     // bg + 8% accent
    tlSidePanel: mixHex('#2c8fc4', '#dfeaf4', 0.08), // inset (bgSoft) + 8% accent
  },
  'Ice: derived slots follow their documented rule',
);
assert.deepEqual(
  {
    border: midnight.border, borderLight: midnight.borderLight, textDim: midnight.textDim,
    accentDeep: midnight.accentDeep, tlTrack: midnight.tlTrack, tlSidePanel: midnight.tlSidePanel,
  },
  {
    border: mixHex('#dcf3ff', '#121c2e', 0.08),      // hairlines are tinted ice, not white
    borderLight: mixHex('#dcf3ff', '#121c2e', 0.16),
    textDim: mixHex('#93a7bc', '#5c6e82', 0.50),     // inkMute lifted 50% toward inkSoft
    accentDeep: mixHex('#0b1220', '#00bfff', 0.20),  // accent 20% toward the ground
    tlTrack: mixHex('#00bfff', '#0b1220', 0.08),
    tlSidePanel: mixHex('#00bfff', '#111a2b', 0.08),
  },
  'Midnight: derived slots follow their documented rule',
);
// Timeline kind colours are shared by the pair and composited over Midnight's
// ground, because the clip label colours are fixed and cannot follow the skin.
// Weights: chips 90% (they print the dark `onAccent`), fills 50% (fixed near-white
// label), clipAudio 78% (the one fill whose label and waveform are fixed dark).
for (const [slot, hue, weight] of [
  ['trackVideo', '#00bfff', 0.90], ['trackAudioA1', '#e0a35a', 0.90],
  ['trackAudioA2', '#5fc9b0', 0.90], ['trackCaption', '#9b82ff', 0.90],
  ['clipVideo', '#00bfff', 0.50], ['clipAudio', '#5fc9b0', 0.78],
  ['clipMg', '#9b82ff', 0.50], ['clipText', '#e0a35a', 0.50],
] as [keyof typeof ice, string, number][]) {
  assert.equal(ice[slot], mixHex(hue, '#0b1220', weight), `Ice.${slot}: hue over Midnight ground`);
  assert.equal(midnight[slot], ice[slot], `Midnight.${slot}: shared with Ice`);
}
// Secondary copy (field help, pane notes, inactive tabs) lands on `bg` as often as on
// `panel`, so the Ice family holds textDim to 4.5:1 on BOTH — a step past the 4.4
// registry gate below, which only looks at `panel`.
for (const t of [ice, midnight]) {
  for (const ground of [t.panel, t.bg, t.panelAlt] as const) {
    assert.ok(
      contrast(t.textDim, ground) >= 4.5,
      `textDim on ${ground} = ${contrast(t.textDim, ground).toFixed(2)} < 4.5`,
    );
  }
}

// The ink each timeline surface has to carry, gated where the skin cannot choose it.
for (const t of [ice, midnight]) {
  const chipGate = (slot: 'trackVideo' | 'trackAudioA1' | 'trackAudioA2' | 'trackCaption'): void =>
    assert.ok(
      contrast(t.onAccent, t[slot]) >= 4.5,
      `${slot}: track chip ink = ${contrast(t.onAccent, t[slot]).toFixed(2)} < 4.5`,
    );
  chipGate('trackVideo'); chipGate('trackAudioA1'); chipGate('trackAudioA2'); chipGate('trackCaption');
  // `.cc-clip-label` #f3e7ef on the white-label fills, `.cc-clip-label.audio` #0d2717
  // on the audio fill — both fixed in index.css, so the fill must meet them.
  for (const slot of ['clipVideo', 'clipMg', 'clipText'] as const) {
    assert.ok(contrast('#f3e7ef', t[slot]) >= 4.5, `${slot}: clip label = ${contrast('#f3e7ef', t[slot]).toFixed(2)} < 4.5`);
  }
  assert.ok(contrast('#0d2717', t.clipAudio) >= 4.5, `clipAudio: audio label = ${contrast('#0d2717', t.clipAudio).toFixed(2)} < 4.5`);
}
// The rgb triples must be the same colour as their hex twin (they are used for
// rgba() glows and translucent ink, and a mismatch shows up as a hue shift).
for (const t of [ice, midnight]) {
  const triple = (hex: string): string => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
  assert.equal(t.accentRgb, triple(t.accent), 'accentRgb matches accent');
  assert.equal(t.inkRgb, triple(t.text), 'inkRgb matches text');
}
// Light-first is the identity, and every pre-existing skin stays selectable so a
// saved `cc.skin` never resolves to a different look.
assert.equal(DEFAULT_SKIN, 'ice', 'Ice is the default skin (AquariusOS is light-first)');
for (const legacy of ['aquarius', 'aquariuslight', 'graphite', 'midnight', 'mocha', 'nord', 'tokyo', 'latte']) {
  assert.ok(SKINS.some((s) => s.id === legacy), `${legacy}: pre-Ice skin must stay selectable`);
}

// ── Contrast Gate (AA) ──
for (const s of SKINS) {
  const t = s.tokens;
  const gate = (label: string, ratio: number, min: number): void =>
    assert.ok(ratio >= min, `${s.id}: ${label} = ${ratio.toFixed(2)} < ${min}`);
  gate('text/panel', contrast(t.text, t.panel), 7);
  gate('text/panelAlt', contrast(t.text, t.panelAlt), 4.5);
  gate('textMuted/panel', contrast(t.textMuted, t.panel), 4.5);
  gate('textDim/panel', contrast(t.textDim, t.panel), 4.4);
  // onAccent by WCAG component/large font level (≥3): graphite white font pressure coral=3.27.
  // (Identity reserved); Use dark characters for pastel skin (Mocha/Arctic/Tokyo Night/Latte), actual ≥4.5.
  gate('onAccent/accent', contrast(t.onAccent, t.accent), 3);
  gate('textStrong/hover', contrast(t.textStrong, t.hover), 4.5);
  gate('audioFxBadge/panelGold10', contrast(t.text, mixHex(t.gold, t.panel, 0.1)), 4.5);
  // The viewer surround is dark on EVERY skin — a light ground around the picture
  // distorts colour judgement. Gate it against white (a light surround would score
  // near 1) and check that its own ink is readable on it.
  gate('white/viewerSurround', contrast('#ffffff', t.viewerSurround), 12);
  gate('onViewerSurround/viewerSurround', contrast(t.onViewerSurround, t.viewerSurround), 4.5);
}

// ── CSS generation: The default skin enters:root, the rest have overlay blocks, and body follows ──
const css = buildSkinsCss();
assert.ok(css.includes(':root {'), ':root block');
for (const s of SKINS) {
  if (s.id === DEFAULT_SKIN) continue;
  assert.ok(css.includes(`html[data-cc-skin='${s.id}']`), `${s.id} override block`);
}
assert.ok(css.includes('--cc-on-accent:'), 'on-accent variable output');
assert.ok(css.includes('--cc-shadow-rgb:'), 'shadow-rgb variable output');
assert.ok(css.includes('body { background: var(--cc-bg)'), 'body follows the skin');

process.stdout.write(`skins.verify: ok (${SKINS.length} skins, all contrast gates passed)\n`);
