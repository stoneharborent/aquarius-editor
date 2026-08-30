#!/usr/bin/env node
// Generate the built-in camera-log → Rec.709 CONVERSION LUTs shipped in assets/luts/.
//
// WHY THIS SCRIPT EXISTS
// ---------------------
// Camera makers publish their own .cube files, but their licences generally do not allow
// redistribution, and this repo is public AGPL. Transfer-function formulas and published
// colorimetry constants are facts, not creative work, so we build the LUTs from the
// vendors' PUBLISHED specifications instead of shipping their files. Every constant below
// is traced to a source URL.
//
// These are CONVERSIONS, not creative looks. The pipeline is a plain colorimetric
// transform — log decode → gamut matrix → the vendor's own exposure offset (only where the
// vendor publishes one) → Rec.709 OETF → clip to [0,1]. No shoulder, no contrast curve, no
// saturation move. Scene values above Rec.709's ~2.47 stops of headroom over middle grey
// therefore CLIP rather than roll off, because none of these three vendors publishes a
// reproducible highlight rolloff. (GoPro's white paper mentions an optional "multi-stage
// HSV compression" rolloff but does not specify it, so it is deliberately not implemented.)
// Users dial the effect's Intensity slider down, or grade on top, if they want a softer top end.
//
// USAGE
//   node scripts/generate-conversion-luts.mjs             # write into assets/luts/
//   node scripts/generate-conversion-luts.mjs --out DIR   # write elsewhere (used by the verify)
//
// The verify (src/gl/fx/conversion-luts.verify.ts) re-runs this into a temp dir and asserts
// byte-identity with the committed files, so the .cube files can never drift from this script.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every generated LUT is 33³ — the size the other built-ins use and what NLEs expect. */
export const LUT_SIZE = 33;

// ─────────────────────────────────────────────────────────────────────────────
// Colorimetry primitives
// ─────────────────────────────────────────────────────────────────────────────

// CIE xy primaries + white point.
//   Rec.709  — ITU-R BT.709-6, Table 1: https://www.itu.int/rec/R-REC-BT.709
//   Rec.2020 — ITU-R BT.2020-2, Table 1: https://www.itu.int/rec/R-REC-BT.2020
//   (Nikon's N-Log spec restates the BT.2020 primaries verbatim, see NIKON_N_LOG below.)
const D65 = { x: 0.3127, y: 0.329 };
const REC709_PRIMARIES = { r: { x: 0.64, y: 0.33 }, g: { x: 0.3, y: 0.6 }, b: { x: 0.15, y: 0.06 }, w: D65 };
const REC2020_PRIMARIES = { r: { x: 0.708, y: 0.292 }, g: { x: 0.17, y: 0.797 }, b: { x: 0.131, y: 0.046 }, w: D65 };

/** 3×3 matrix helpers. Matrices are row-major arrays of 3 rows of 3 numbers. */
function matMul(a, b) {
  const out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    out[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
  }
  return out;
}

function matInvert(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) throw new Error('singular matrix');
  return [
    [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
}

function matApply(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/**
 * Standard RGB→XYZ derivation from chromaticities (SMPTE RP 177 / Bruce Lindbloom):
 * build the primary matrix from xyY, solve for the per-primary scale factors that make the
 * RGB (1,1,1) land on the white point, then scale the columns.
 */
function rgbToXyz({ r, g, b, w }) {
  const col = (p) => [p.x / p.y, 1, (1 - p.x - p.y) / p.y];
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const cols = [col(r), col(g), col(b)];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] = cols[j][i];
  const s = matApply(matInvert(m), col(w));
  return [
    [m[0][0] * s[0], m[0][1] * s[1], m[0][2] * s[2]],
    [m[1][0] * s[0], m[1][1] * s[1], m[1][2] * s[2]],
    [m[2][0] * s[0], m[2][1] * s[1], m[2][2] * s[2]],
  ];
}

/**
 * Rec.2020 → Rec.709 linear-light matrix, derived from the two sets of published primaries.
 * Both share the D65 white point, so no chromatic adaptation is needed.
 *
 * Cross-check: GoPro publishes the same matrix numerically in their GP-Log2 white paper
 * (https://gopro.github.io/labs/log/, §4 "The Rec.2020 → Rec.709 Matrix"):
 *   R709 =  1.6605·R2020 − 0.5876·G2020 − 0.0728·B2020
 *   G709 = −0.1246·R2020 + 1.1329·G2020 − 0.0083·B2020
 *   B709 = −0.0182·R2020 − 0.1006·G2020 + 1.1187·B2020
 * assertMatrixMatchesGoPro() below checks our derivation against it on every run.
 */
export const REC2020_TO_REC709 = matMul(matInvert(rgbToXyz(REC709_PRIMARIES)), rgbToXyz(REC2020_PRIMARIES));

const GOPRO_PUBLISHED_2020_TO_709 = [
  [1.6605, -0.5876, -0.0728],
  [-0.1246, 1.1329, -0.0083],
  [-0.0182, -0.1006, 1.1187],
];

function assertMatrixMatchesGoPro() {
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const delta = Math.abs(REC2020_TO_REC709[i][j] - GOPRO_PUBLISHED_2020_TO_709[i][j]);
    if (delta > 5e-4) {
      throw new Error(`Rec.2020→Rec.709 derivation disagrees with GoPro's published matrix at [${i}][${j}] by ${delta}`);
    }
  }
}

/**
 * Rec.709 OETF (scene linear → display code value) — ITU-R BT.709-6, Table 1, item 1.2:
 *   V = 4.500 · L                     for 0 ≤ L < 0.018
 *   V = 1.099 · L^0.45 − 0.099        for 0.018 ≤ L ≤ 1
 * Middle grey lands at OETF(0.18) ≈ 0.4069, i.e. ~41 IRE — the textbook Rec.709 anchor
 * every LUT below is validated against.
 */
export function rec709Oetf(l) {
  const x = Math.max(0, l);
  return x < 0.018 ? 4.5 * x : 1.099 * Math.pow(x, 0.45) - 0.099;
}

/** Scene grey (18% reflectance) after the Rec.709 OETF. ≈ 0.40694. */
export const REC709_MIDDLE_GREY = rec709Oetf(0.18);

// ─────────────────────────────────────────────────────────────────────────────
// Camera log transfer functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * NIKON N-LOG
 * Source: "N-Log Specification Document", Version 1.0.0, September 1st 2018, Nikon Corporation
 *   https://download.nikonimglib.com/archive3/hDCmK00m9JDI03RPruD74xpoU905/N-Log_Specification_(En)01.pdf
 *
 * §2 Curve Characteristics — "The function from N-Log to reflectance is as follows."
 *   if (x < 452)  y = (x/650)^3 − 0.0075
 *   else          y = exp((x − 619)/150)
 * where x is the N-Log 10-bit code value and y is reflectance (y = 0.18 is Stop 0).
 *
 * §3 Gamut and White Point — white point D65 (0.3127, 0.3290); primaries R(0.708, 0.292),
 * G(0.170, 0.797), B(0.131, 0.046): "The gamut for N-Log is same as the wide color gamut
 * known as ITU-R BT.2020."
 *
 * The .cube input axis is the normalized 10-bit code value, so x = v · 1023 (full range).
 * Reflectance is used directly as scene linear light: a 100% reflector (y = 1) is Rec.709
 * display white, which puts 18% grey at OETF(0.18) ≈ 41 IRE. Nikon publishes no exposure
 * offset and no highlight rolloff, so none is applied.
 */
export const NIKON_N_LOG = {
  codeBreakpoint: 452,
  toReflectance(v) {
    const x = v * 1023;
    return x < 452 ? Math.pow(x / 650, 3) - 0.0075 : Math.exp((x - 619) / 150);
  },
  /** Inverse (reflectance → normalized code), from the same spec section. Used by the verify. */
  fromReflectance(y) {
    const x = y < 0.328 ? 650 * Math.pow(y + 0.0075, 1 / 3) : 150 * Math.log(y) + 619;
    return x / 1023;
  },
};

/**
 * GOPRO GP-LOG2 (log base 600)
 * Source: "GP-Log2 & Logarithmic Exposure", GoPro Labs white paper
 *   https://gopro.github.io/labs/log/
 * Companion tool: https://gopro.github.io/labs/gplog2/
 *
 * §3 The Inverse Transform — "L = (600^v − 1) / (600 − 1)"
 * §4 Color Primaries — "GP-Log2 footage is encoded with Rec.2020 color primaries."
 * §6 EV Compensation — the LUT generator's default is +1.8 EV, and GoPro states it "is
 *   calibrated to restore 18% grey to its correct display value when using nominal camera
 *   metering. This is not arbitrary — it reflects the camera manufacturer's intended
 *   middle-grey placement for this log format." That makes +1.8 EV vendor-published, so we
 *   apply it. Cross-check from §3: GoPro maps "L = 0.0517 (18% grey)", and
 *   0.0517 × 2^1.8 = 0.1800 → OETF → 0.4069 = Rec.709 middle grey. The chain closes.
 * §10 The Transform Pipeline — decode → colour matrix → EV gain → (optional rolloff) →
 *   output transfer function → clamp. We follow it, minus the unspecified rolloff.
 *
 * NAMING: GoPro ships two log curves. GP-Log is log base 400 paired with GoPro's *native*
 * (unpublished) gamut, on HERO13 Black and HERO12 via Labs. GP-Log2 is log base 600 paired
 * with Rec.2020, on MISSION 1 series and MAX 2 — and it is the only one GoPro has published
 * a full specification for, which is why it is the one we ship.
 */
export const GOPRO_GP_LOG2 = {
  base: 600,
  evCompensation: 1.8,
  toLinear(v) {
    return (Math.pow(600, v) - 1) / 599;
  },
  fromLinear(l) {
    return Math.log(l * 599 + 1) / Math.log(600);
  },
};

/**
 * INSTA360 I-LOG — ⚠️ APPROXIMATION, NOT A PUBLISHED SPECIFICATION ⚠️
 *
 * Insta360 does NOT publish an i-Log transfer function. Their DaVinci Resolve integration
 * ships a proprietary "Insta I-Log" input gamma, and their official .cube is licence-
 * restricted, so neither is a source we can build from. What Insta360 *does* publish, in the
 * Luna Ultra online manual (https://onlinemanual.insta360.com/lunaultra/en-us/operation-tutorials/shooting-preview/shooting-specs/i-log):
 *   • "10-bit I-Log with 14 stops of dynamic range"
 *   • "The color space of the I-Log final video is Rec.2020"
 * (The X5 manual page is vaguer and only says the graded result "can reach Rec.709":
 *  https://onlinemanual.insta360.com/x5/en-us/operating_tutorials/capture-preview/shooting-function/i-log)
 *
 * So the GAMUT is taken as published fact (Rec.2020 primaries). The CURVE is modelled, with
 * every assumption named here so it can be corrected against real footage:
 *
 *   A1 (published) Rec.2020 primaries.
 *   A2 (assumed)   The curve belongs to the normalized log family L = (B^v − 1)/(B − 1) —
 *                  the form GoPro publishes for action-camera log encodings (see above), and
 *                  the shape action-cam log profiles generally take.
 *   A3 (assumed)   Log base B = 400. GoPro's published bases bracket the useful range for a
 *                  10-bit action camera: 113 (Protune Flat), 400 (GP-Log), 600 (GP-Log2,
 *                  "up to 14 stops"). 400 sits mid-family and is not identical to the
 *                  GP-Log2 curve we ship alongside it.
 *   A4 (assumed)   18% scene grey sits at code value 0.46, mid-way through the 0.40–0.55
 *                  band that 10-bit camera log curves place middle grey in. The exposure
 *                  gain below is derived from A2+A3+A4, not chosen independently.
 *
 * TO RECALIBRATE against a real clip: shoot a grey card, read its i-Log code value, put that
 * number in GREY_CODE_VALUE, and re-run this script. If you can also read the clip's clip
 * point, adjust `base`. Everything downstream follows automatically.
 */
export const INSTA360_I_LOG = {
  base: 400,
  /** A4: assumed normalized code value of 18% scene grey. */
  GREY_CODE_VALUE: 0.46,
  toLinear(v) {
    return (Math.pow(this.base, v) - 1) / (this.base - 1);
  },
  /** Exposure gain that lands the assumed grey code value on 0.18 scene linear. */
  get exposureGain() {
    return 0.18 / ((Math.pow(this.base, this.GREY_CODE_VALUE) - 1) / (this.base - 1));
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// LUT definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Each profile turns one normalized log RGB triplet into a Rec.709 display triplet.
 * Shared pipeline, per GoPro's documented LUT order (§10) which the other two follow too:
 *   log decode → gamut matrix → EV gain → Rec.709 OETF → clamp [0,1]
 */
function makeTransform({ decode, matrix, gain }) {
  return (rgb) => {
    const lin = rgb.map((v) => decode(v));
    const converted = matrix ? matApply(matrix, lin) : lin;
    return converted.map((c) => Math.min(1, Math.max(0, rec709Oetf(Math.max(0, c * gain)))));
  };
}

export const PROFILES = [
  {
    file: 'Nikon_NLog_BT2020_to_Rec709.cube',
    title: 'Nikon N-Log BT.2020 to Rec.709',
    header: [
      'Nikon N-Log (BT.2020 gamut) -> Rec.709 conversion',
      'Generated by scripts/generate-conversion-luts.mjs -- do not hand-edit.',
      'Spec: Nikon "N-Log Specification Document", Version 1.0.0, September 1st 2018',
      '  https://download.nikonimglib.com/archive3/hDCmK00m9JDI03RPruD74xpoU905/N-Log_Specification_(En)01.pdf',
      '  curve   : x < 452 -> y = (x/650)^3 - 0.0075 ; else y = exp((x-619)/150)  (x = 10-bit code, y = reflectance)',
      '  gamut   : ITU-R BT.2020 primaries, D65 white point',
      'Output  : ITU-R BT.709-6 OETF, clipped to [0,1]. No exposure offset and no highlight',
      '          rolloff -- Nikon publishes neither. Colorimetric conversion, not a look.',
    ],
    transform: makeTransform({
      decode: (v) => NIKON_N_LOG.toReflectance(v),
      matrix: REC2020_TO_REC709,
      gain: 1,
    }),
  },
  {
    file: 'GoPro_GPLog2_Rec2020_to_Rec709.cube',
    title: 'GoPro GP-Log2 Rec.2020 to Rec.709',
    header: [
      'GoPro GP-Log2 (log base 600, Rec.2020 gamut) -> Rec.709 conversion',
      'Generated by scripts/generate-conversion-luts.mjs -- do not hand-edit.',
      'Spec: GoPro Labs, "GP-Log2 & Logarithmic Exposure"  https://gopro.github.io/labs/log/',
      '  curve   : L = (600^v - 1) / 599',
      '  gamut   : Rec.2020 primaries',
      '  exposure: +1.8 EV, GoPro\'s published default, "calibrated to restore 18% grey to its',
      '            correct display value when using nominal camera metering"',
      'Cameras : MISSION 1 series, MAX 2. HERO13 Black / HERO12 shoot GP-Log (log base 400,',
      '          GoPro native gamut) -- a different curve GoPro has not published, so it is',
      '          not covered by this LUT.',
      'Output  : ITU-R BT.709-6 OETF, clipped to [0,1]. GoPro\'s optional HSV highlight rolloff',
      '          is not specified numerically and is deliberately not implemented.',
    ],
    transform: makeTransform({
      decode: (v) => GOPRO_GP_LOG2.toLinear(v),
      matrix: REC2020_TO_REC709,
      gain: Math.pow(2, GOPRO_GP_LOG2.evCompensation),
    }),
  },
  {
    file: 'Insta360_iLog_Rec2020_to_Rec709.cube',
    title: 'Insta360 i-Log to Rec.709 (approximate)',
    header: [
      'Insta360 i-Log -> Rec.709 conversion -- APPROXIMATE',
      'Generated by scripts/generate-conversion-luts.mjs -- do not hand-edit.',
      'Insta360 publishes NO i-Log transfer function. Only the gamut is a published fact:',
      '  "10-bit I-Log with 14 stops of dynamic range" / "The color space of the I-Log final',
      '  video is Rec.2020"  --  Insta360 Luna Ultra online manual',
      '  https://onlinemanual.insta360.com/lunaultra/en-us/operation-tutorials/shooting-preview/shooting-specs/i-log',
      'The curve is MODELLED: normalized log family L = (B^v - 1)/(B - 1) with base B = 400 and',
      '18% grey assumed at code value 0.46. See INSTA360_I_LOG in the generator for the full list',
      'of assumptions and how to recalibrate against a grey card.',
      'Treat this as a starting point, not a colorimetrically exact transform.',
      'Output  : ITU-R BT.709-6 OETF, clipped to [0,1].',
    ],
    transform: makeTransform({
      decode: (v) => INSTA360_I_LOG.toLinear(v),
      matrix: REC2020_TO_REC709,
      gain: INSTA360_I_LOG.exposureGain,
    }),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// .cube writing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adobe/IRIDAS .cube 3D LUT text. Red varies fastest, then green, then blue — the format's
 * required ordering, and what src/gl/fx/cube.ts reads back.
 * Deterministic 6-decimal formatting so regenerating is byte-identical.
 */
export function renderCube({ title, header, transform }, size = LUT_SIZE) {
  const lines = [];
  for (const h of header) lines.push(`# ${h}`);
  lines.push('');
  lines.push(`TITLE "${title}"`);
  lines.push(`LUT_3D_SIZE ${size}`);
  lines.push('DOMAIN_MIN 0.0 0.0 0.0');
  lines.push('DOMAIN_MAX 1.0 1.0 1.0');
  lines.push('');
  const last = size - 1;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const out = transform([r / last, g / last, b / last]);
        lines.push(out.map((c) => c.toFixed(6)).join(' '));
      }
    }
  }
  lines.push('');
  return lines.join('\n');
}

function main(argv) {
  assertMatrixMatchesGoPro();
  const outIdx = argv.indexOf('--out');
  const outDir = outIdx >= 0 ? path.resolve(argv[outIdx + 1]) : path.join(ROOT, 'assets', 'luts');
  mkdirSync(outDir, { recursive: true });
  for (const profile of PROFILES) {
    const text = renderCube(profile);
    writeFileSync(path.join(outDir, profile.file), text, 'utf8');
    console.log(`wrote ${path.join(outDir, profile.file)} (${LUT_SIZE}³)`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
