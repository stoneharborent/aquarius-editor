// Skinning engine: skin = a set of design token values. The tokens of theme.ts are all
// var(--cc-*) indirect reference, the true value is the SKINS registry here; when booting, initSkins() puts all
// The skin is generated into a <style> and injected into the head, switch = change an attribute of <html data-cc-skin>,
// Hundreds of inline styles with zero changes and zero re-rendering. Persistence localStorage('cc.skin').
// Security boundary (audited): The theme token is not consumed in synthesis/GL/canvas, and export and burning are not affected by the skin;
// Full position without hex splicing (`${theme.x}22`) and SVG attribute bit (fill= attribute does not parse var).
// Translucent "ink" (--cc-ink-rgb) and accent glow (--cc-accent-rgb) with R,G,B bare triples
// Stored for use by rgba(var(--cc-ink-rgb), α) of index.css - white ink for dark skin and black ink for light skin.

export interface SkinTokens {
  bg: string;          // Editor void/timeline bottom
  inset: string;       // Inner groove (input well, bottom one level deeper)
  panel: string;       // Bottom of panel
  panelAlt: string;    // Card/Elastic Layer/Suspended Bottom
  hover: string;       // Row hover / activate fill
  border: string;
  borderLight: string;
  text: string;
  textMuted: string;   // Secondary text (lighter than text, brighter than dim)
  textDim: string;
  textStrong: string;  // Hover to highlight text (dark skin #fff, light skin almost black)
  accent: string;
  accentDeep: string;  // accent press / bottom of main button (#c45c26 file)
  accentRgb: string;   // "R,G,B" for glow rgba()
  /** Text color on accent filling: white text on dark skin; pastel accent (mocha peach/arctic ice blue)
   * The contrast of white characters is only ~2:1, and dark characters must be used (≥4.5:1, which has been asserted skin by skin). */
  onAccent: string;
  inkRgb: string;      // "R,G,B" translucent ink base color (dark skin 255,255,255)
  shadowRgb: string;   // "R,G,B" floating layer shadow/mask base color
  colorScheme: 'dark' | 'light';
  gold: string;
  select: string;
  success: string;
  danger: string;
  tlTrack: string;
  tlSidePanel: string;
  trackVideo: string;
  trackAudioA1: string;
  trackAudioA2: string;
  trackCaption: string;
  clipVideo: string;
  clipAudio: string;
  clipMg: string;
  clipText: string;
}

export interface SkinDef {
  id: string;
  name: string;
  tokens: SkinTokens;
}

// ─────────────────────────────────────────────────────────────────────────────
// AquariusOS — the default skin. THE LAW for every value below is
// `../../os-image/branding/tokens.md` (the OS design tokens). Nothing here is
// picked by eye: a token is either copied straight out of that file, or derived
// from it by a rule written next to the value.
//
// tokens.md → --cc-* mapping (dark, the real design):
//   void #06070C ........ bg          surface-1 #10121C ... panel
//   surface-2 #161A29 ... panelAlt    surface-3 #1D2236 ... hover
//   starlight #8AB4FF ... accent + select (tokens.md: "buttons, links, selection, focus rings")
//   starlight-press ..... accentDeep  on-accent #080B14 ... onAccent
//   text-1/2 ............ text / textMuted
//   warning #E6C069 ..... gold   (the `gold` slot IS this app's warning channel:
//                                 .warn lines, pending states, locked tracks, the
//                                 minimize traffic light. tokens.md's `ancient`
//                                 #E6DDB8 is explicitly "rare on purpose — twice on
//                                 one screen and you are using it wrong", so it is
//                                 deliberately NOT wired to a slot that repeats.)
//   success #55D6A5 ..... success     danger #FF7A85 ...... danger
//
// tokens.md values with no slot in this contract (recorded, not dropped):
//   starlight-hover #A8C6FF — the app builds accent hover states with color-mix()
//   and rgba(var(--cc-accent-rgb), α), so there is no accent-hover variable.
//   ancient #E6DDB8 — see above. oled #000000 — the Midnight skin already owns
//   true black. grad-play — a gradient, not a single-value token.
//
// Derived slots (each with its rule; nothing is eyeballed):
//   inset ....... void ↔ surface-1 midpoint — one step deeper than the panel.
//   border ...... tokens.md border-1 rgba(237,239,247,.08) flattened over
//   borderLight . surface-1; border-2 rgba(237,239,247,.14) the same way. (The
//                 skin contract stores opaque 6-digit hex, so the hairline alphas
//                 are composited once here instead of at paint time.)
//   textDim ..... text-3 #565C72 is tokens.md's *disabled/placeholder* tone and
//                 only reaches 2.82:1 on surface-1; this app's textDim slot carries
//                 readable secondary copy and is gated at 4.4:1, so it is text-3
//                 lifted 60% toward text-2 — the smallest lift that clears the gate.
//   textStrong .. text-1 at full brightness (#ffffff) for hover emphasis.
//   inkRgb ...... text-1's RGB triple (translucent ink on a dark ground).
//   shadowRgb ... 0,0,0 — every shadow token in tokens.md is rgba(0,0,0,…).
//   tlTrack ..... surface-2 + 8% nebula; tlSidePanel = surface-1 + 8% nebula.
//                 The timeline reads as the same room, tinted toward the wallpaper.
//   track*/clip*  Timeline kind colors keep a semantic hue from tokens.md —
//                 video = starlight, audio = success, motion graphics = nebula,
//                 text/A1 = warning — composited over `void` so the white clip and
//                 chip labels stay legible: **chips at 62%, clip fills at 50%**.
//                 nebula is the one exception: it is already darker than every
//                 other hue at 62%, so the caption chip uses it at full strength
//                 and the MG clip fill sits at 78%.
// ─────────────────────────────────────────────────────────────────────────────
const AQUARIUS: SkinTokens = {
  bg: '#06070c', inset: '#0b0d14', panel: '#10121c', panelAlt: '#161a29', hover: '#1d2236',
  border: '#22242e', borderLight: '#2f313b',
  text: '#edeff7', textMuted: '#8a90a6', textDim: '#757b91', textStrong: '#ffffff',
  accent: '#8ab4ff', accentDeep: '#6e9bf2', accentRgb: '138,180,255', onAccent: '#080b14',
  inkRgb: '237,239,247', shadowRgb: '0,0,0', colorScheme: 'dark',
  gold: '#e6c069', select: '#8ab4ff', success: '#55d6a5', danger: '#ff7a85',
  tlTrack: '#1c1e38', tlSidePanel: '#16172c',
  trackVideo: '#5872a3', trackAudioA1: '#917a46', trackAudioA2: '#37876b', trackCaption: '#5b4be0',
  clipVideo: '#485e86', clipAudio: '#2e6f59', clipMg: '#483cb1', clipText: '#76643b',
};

// Graphite = the look and feel before the skin system existed (and before the
// AquariusOS identity landed). Still selectable, still the base every non-Aquarius
// skin spreads from.
const GRAPHITE: SkinTokens = {
  bg: '#101010', inset: '#141414', panel: '#181818', panelAlt: '#212121', hover: '#2c2c2c',
  border: '#363636', borderLight: '#4a4a4a',
  text: '#e2e2e2', textMuted: '#b0b0b0', textDim: '#808080', textStrong: '#ffffff',
  accent: '#dc7036', accentDeep: '#c45c26', accentRgb: '220,112,54', onAccent: '#ffffff',
  inkRgb: '255,255,255', shadowRgb: '0,0,0', colorScheme: 'dark',
  gold: '#e6ac42', select: '#3b82f6', success: '#3fae6a', danger: '#e06c60',
  tlTrack: '#25262b', tlSidePanel: '#202126',
  trackVideo: '#3b4bd8', trackAudioA1: '#e8993f', trackAudioA2: '#3fae6a', trackCaption: '#b05bd3',
  clipVideo: '#2d7fb5', clipAudio: '#2f9e5a', clipMg: '#c14d86', clipText: '#c8912f',
};

// Color source (the user named the GitHub theme, the value is the official color palette, MIT):
// AquariusOS / AquariusOS Light = os-image/branding/tokens.md (the OS design system).
// Mocha/Latte = Catppuccin(github.com/catppuccin/palette,palette.json check),
// Arctic = Nord(nordtheme.com), Tokyo Night = Tokyo Night. Graphite/Jet Black = homemade dark color.
// Discipline (impeccable colorize): Only official neutral gradients are used for surface elevation; track/fragment/select/
// success is **semantic color**, unified across skins (inherited from graphite); text comparison text/panel ≥ 7,
// textDim/panel ≥ 4.5, onAccent/accent ≥ 4.5 (script skin-by-skin assertion, individual official grayscale
// Fine-tune L to meet the standard). Pastel accent skin (Mocha/Arctic/Tokyo Night/Latte) onAccent uses dark fonts.
export const SKINS: readonly SkinDef[] = [
  { id: 'aquarius', name: 'AquariusOS', tokens: AQUARIUS },
  // AquariusOS Light — tokens.md's *derived* light palette ("light is not a
  // separate design; it is the dark palette re-grounded"). Copied values:
  // background #EEF0F7, surface-1 #F7F8FC, surface-2 #FFFFFF, starlight #3D63D6,
  // starlight-press #2545AD, nebula #4A3BC9, on-accent #FFFFFF, text-1 #141726,
  // text-2 #565C72, text-3 #8A90A6, border-1/2 rgba(20,23,38,.10/.16).
  // Derived here (tokens.md's light table stops short of these slots):
  //   inset/hover — light text-1 at 4% / 8% over the light background. In light
  //     mode a recess and a row hover must go DARKER than the panel, and the
  //     light surface stack only climbs toward white.
  //   textDim — light text-3 is 2.99:1 on light surface-1; darkened 55% toward
  //     light text-2 to clear the 4.4:1 gate (mirror of the dark skin's lift).
  //   textStrong — light text-1 at full depth (#000000), mirror of dark's #ffffff.
  //   gold/success/danger — tokens.md gives no light status trio. Each keeps its
  //     dark hue and saturation and is darkened until it reads 4.5:1 on light
  //     surface-1, the same "deepen the accent for a white ground" move tokens.md
  //     makes itself for starlight and ancient.
  //   tlTrack/tlSidePanel — light background / light inset + 8% light nebula
  //     (same 8% nebula tint as the dark skin).
  //   track*/clip* — inherited from the dark skin unchanged: timeline kind colors
  //     are semantic, not decorative, and stay stable across skins (the same rule
  //     Latte follows against Graphite).
  {
    id: 'aquariuslight', name: 'AquariusOS Light',
    tokens: {
      ...AQUARIUS,
      bg: '#eef0f7', inset: '#e5e7ef', panel: '#f7f8fc', panelAlt: '#ffffff', hover: '#dddfe6',
      border: '#e0e2e7', borderLight: '#d3d4da',
      text: '#141726', textMuted: '#565c72', textDim: '#6d7389', textStrong: '#000000',
      accent: '#3d63d6', accentDeep: '#2545ad', accentRgb: '61,99,214', onAccent: '#ffffff',
      inkRgb: '20,23,38', colorScheme: 'light',
      gold: '#906c18', select: '#3d63d6', success: '#1f815c', danger: '#cc0011',
      tlTrack: '#e1e2f3', tlSidePanel: '#d9d9ec',
    },
  },
  { id: 'graphite', name: 'Graphite', tokens: GRAPHITE },
  {
    id: 'midnight', name: 'Midnight',
    tokens: {
      ...GRAPHITE,
      bg: '#000000', inset: '#070707', panel: '#0b0b0b', panelAlt: '#161616', hover: '#212121',
      border: '#282828', borderLight: '#3d3d3d',
      text: '#e6e6e6', textMuted: '#ababab', textDim: '#7d7d7d',
      tlTrack: '#131417', tlSidePanel: '#0e0f11',
    },
  },
  // Catppuccin Mocha:crust/mantle/base/surface level,accent = peach color (warm tone)
  {
    id: 'mocha', name: 'Mocha',
    tokens: {
      ...GRAPHITE,
      bg: '#11111b', inset: '#181825', panel: '#1e1e2e', panelAlt: '#313244', hover: '#45475a',
      border: '#45475a', borderLight: '#585b70',
      text: '#cdd6f4', textMuted: '#a6adc8', textDim: '#868ba4', textStrong: '#ffffff',
      accent: '#fab387', accentDeep: '#dc976b', accentRgb: '250,179,135', onAccent: '#11111b',
      gold: '#f9e2af', select: '#89b4fa', success: '#a6e3a1', danger: '#f38ba8',
      tlTrack: '#242436', tlSidePanel: '#1b1b2c',
    },
  },
  // Nord: polar night level, accent = frost ice blue
  {
    id: 'nord', name: 'Nord',
    tokens: {
      ...GRAPHITE,
      bg: '#252b37', inset: '#2a2f3b', panel: '#2e3440', panelAlt: '#3b4252', hover: '#434c5e',
      border: '#4c566a', borderLight: '#626d81',
      text: '#eceff4', textMuted: '#d8dee9', textDim: '#919cb3', textStrong: '#ffffff',
      accent: '#88c0d0', accentDeep: '#5e81ac', accentRgb: '136,192,208', onAccent: '#2e3440',
      gold: '#ebcb8b', select: '#81a1c1', success: '#a3be8c', danger: '#ef9aa2',
      tlTrack: '#3d4557', tlSidePanel: '#303745',
    },
  },
  // Tokyo Night:night level (storm as card surface), accent = logo blue
  {
    id: 'tokyo', name: 'Tokyo Night',
    tokens: {
      ...GRAPHITE,
      bg: '#16161e', inset: '#1a1a22', panel: '#1a1b26', panelAlt: '#24283b', hover: '#292e42',
      border: '#3b4261', borderLight: '#545c7e',
      text: '#c0caf5', textMuted: '#a9b1d6', textDim: '#7f86af', textStrong: '#ffffff',
      accent: '#7aa2f7', accentDeep: '#3d59a1', accentRgb: '122,162,247', onAccent: '#16161e',
      gold: '#e0af68', select: '#7dcfff', success: '#9ece6a', danger: '#f7768e',
      tlTrack: '#1f202e', tlSidePanel: '#1c1d2a',
    },
  },
  // Catppuccin Latte: official light color (blue-gray neutral, non-cream beige), accent = peach orange
  {
    id: 'latte', name: 'Latte (Light)',
    tokens: {
      ...GRAPHITE,
      bg: '#dce0e8', inset: '#d3d7df', panel: '#eff1f5', panelAlt: '#e6e9ef', hover: '#d8dce4',
      // Under light color, 0.5px thin lines need to be deeper to be readable: border=surface2, borderLight=overlay1 (official level)
      border: '#acb0be', borderLight: '#8c8fa1',
      text: '#4c4f69', textMuted: '#5c5f77', textDim: '#62657b', textStrong: '#282a42',
      accent: '#fe640b', accentDeep: '#e54c00', accentRgb: '254,100,11', onAccent: '#282a42',
      inkRgb: '40,42,66', colorScheme: 'light',
      gold: '#df8e1d', select: '#1e66f5', success: '#40a02b', danger: '#b00020',
      tlTrack: '#d8dde8', tlSidePanel: '#e3e7ef',
    },
  },
];

const STORAGE_KEY = 'cc.skin';
export const DEFAULT_SKIN = 'aquarius';

const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function skinBlock(tokens: SkinTokens): string {
  return (Object.entries(tokens) as [string, string][])
    .map(([name, value]) => `  --cc-${kebab(name)}: ${value};`)
    .join('\n');
}

/** CSS text of all skins::root = default skin, the rest are covered by data-cc-skin.*/
export function buildSkinsCss(): string {
  const base = SKINS.find((s) => s.id === DEFAULT_SKIN) ?? SKINS[0];
  const overrides = SKINS.filter((s) => s.id !== base.id)
    .map((s) => `html[data-cc-skin='${s.id}'] {\n${skinBlock(s.tokens)}\n}`)
    .join('\n');
  return `:root {\n${skinBlock(base.tokens)}\n}\n${overrides}\n` +
    // The body follows the skin background color + the color direction of the native control (the select/scroll bar goes light under light skin)
    'body { background: var(--cc-bg); color-scheme: var(--cc-color-scheme); }\n';
}

export function getSkin(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SKINS.some((s) => s.id === saved)) return saved;
  } catch { /* If storage is not available, use the default*/ }
  return DEFAULT_SKIN;
}

export function applySkin(id: string): void {
  const skin = SKINS.some((s) => s.id === id) ? id : DEFAULT_SKIN;
  if (skin === DEFAULT_SKIN) delete document.documentElement.dataset.ccSkin;
  else document.documentElement.dataset.ccSkin = skin;
  try { localStorage.setItem(STORAGE_KEY, skin); } catch { /* neglect*/ }
}

/** Boot injection (main.tsx rendering pre-tuning): Create a style sheet + apply persistent skin to avoid flashing default colors.*/
export function initSkins(): void {
  if (!document.getElementById('cc-skins')) {
    const style = document.createElement('style');
    style.id = 'cc-skins';
    style.textContent = buildSkinsCss();
    document.head.appendChild(style);
  }
  applySkin(getSkin());
}
