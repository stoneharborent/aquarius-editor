// Generated camera-log → Rec.709 conversion LUTs.
//   node scripts/run-check.mjs src/gl/fx/conversion-luts.verify.ts
// (run-check, not plain tsx: effects.ts pulls in .frag shader text through the Vite loader)
//
// Two jobs:
//   1. The committed .cube files can never drift from scripts/generate-conversion-luts.mjs —
//      we re-run the generator into a temp dir and assert byte-identity.
//   2. The transforms are colorimetrically sane — every expectation below is DERIVED from the
//      spec constants in the generator (never hand-typed), and asserted loosely enough to be
//      honest about interpolation error at 33³.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseCube, type CubeLut } from './cube';
import { LUT_EFFECTS } from './effects';
// @ts-expect-error — plain .mjs generator, intentionally dependency-free and untyped.
import * as gen from '../../../scripts/generate-conversion-luts.mjs';

const {
  LUT_SIZE,
  PROFILES,
  NIKON_N_LOG,
  GOPRO_GP_LOG2,
  INSTA360_I_LOG,
  REC709_MIDDLE_GREY,
  REC2020_TO_REC709,
} = gen as {
  LUT_SIZE: number;
  PROFILES: Array<{ file: string; title: string }>;
  NIKON_N_LOG: { fromReflectance(y: number): number };
  GOPRO_GP_LOG2: { evCompensation: number; fromLinear(l: number): number };
  INSTA360_I_LOG: { GREY_CODE_VALUE: number };
  REC709_MIDDLE_GREY: number;
  REC2020_TO_REC709: number[][];
};

/** Sample the LUT on its neutral (gray) axis at the nearest grid node to `v`. */
function neutralAt(lut: CubeLut, v: number): [number, number, number] {
  const n = lut.size;
  const i = Math.min(n - 1, Math.max(0, Math.round(v * (n - 1))));
  const idx = (i + i * n + i * n * n) * 3;
  return [lut.data[idx], lut.data[idx + 1], lut.data[idx + 2]];
}

// ── 0. The derived gamut matrix still agrees with GoPro's published one ────────────────
// (the generator asserts this itself on every run; repeat it here so the check is part of CI)
{
  const published = [
    [1.6605, -0.5876, -0.0728],
    [-0.1246, 1.1329, -0.0083],
    [-0.0182, -0.1006, 1.1187],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      assert.ok(
        Math.abs(REC2020_TO_REC709[i][j] - published[i][j]) < 5e-4,
        `Rec.2020→Rec.709 [${i}][${j}] drifted from GoPro's published matrix`,
      );
    }
  }
}

// ── 1. Regenerate-and-diff: committed files are exactly what the generator produces ────
{
  const tmp = mkdtempSync(path.join(tmpdir(), 'aq-luts-'));
  try {
    execFileSync(process.execPath, ['scripts/generate-conversion-luts.mjs', '--out', tmp], { stdio: 'pipe' });
    for (const profile of PROFILES) {
      const committed = readFileSync(path.join('assets/luts', profile.file));
      const fresh = readFileSync(path.join(tmp, profile.file));
      assert.ok(
        committed.equals(fresh),
        `assets/luts/${profile.file} is out of date — re-run: node scripts/generate-conversion-luts.mjs`,
      );
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ── 2. Every generated LUT parses as a well-formed 33³ cube in [0,1] ───────────────────
const luts = new Map<string, CubeLut>();
for (const profile of PROFILES) {
  const lut = parseCube(readFileSync(path.join('assets/luts', profile.file), 'utf8'));
  assert.equal(lut.size, LUT_SIZE, `${profile.file} should be ${LUT_SIZE}³`);
  assert.equal(lut.size, 33, `${profile.file}: the shipped built-ins are 33³`);
  assert.equal(lut.data.length, 33 ** 3 * 3);
  assert.equal(lut.title, profile.title, `${profile.file} TITLE mismatch`);
  for (const v of lut.data) {
    assert.ok(Number.isFinite(v), `${profile.file} contains a non-finite value`);
    assert.ok(v >= 0 && v <= 1, `${profile.file} value ${v} escapes [0,1] — the generator clamps`);
  }
  luts.set(profile.file, lut);
}

// ── 3. Neutral axis is monotonic non-decreasing, starts at black, ends at white ────────
// These are plain colorimetric conversions with no rolloff, so the curve flattens at 0 below
// the log curve's black point and at 1 once the scene exceeds Rec.709's headroom. Monotonic
// non-decreasing (not strictly increasing) is the honest assertion.
for (const [file, lut] of luts) {
  let prev = -1;
  for (let i = 0; i < lut.size; i++) {
    const [r, g, b] = neutralAt(lut, i / (lut.size - 1));
    assert.ok(Math.abs(r - g) < 2e-3 && Math.abs(g - b) < 2e-3, `${file}: neutral axis is not neutral at step ${i}`);
    assert.ok(r >= prev - 1e-6, `${file}: neutral axis dips at step ${i} (${r} < ${prev})`);
    prev = r;
  }
  const black = neutralAt(lut, 0);
  assert.ok(black[0] <= 0.01, `${file}: log black should map near Rec.709 black, got ${black[0]}`);
  const white = neutralAt(lut, 1);
  assert.ok(white[0] >= 0.99, `${file}: the top of the log range should reach display white, got ${white[0]}`);
}

// ── 4. 18% scene grey lands on Rec.709 middle grey (~0.409) for all three ──────────────
// Each grey code value comes from that camera's own published curve, not a magic number:
//   Nikon    — inverse N-Log at reflectance 0.18 (spec §2)
//   GoPro    — inverse GP-Log2 at the linear value that +1.8 EV lifts to 0.18 (white paper §3/§6)
//   Insta360 — the generator's declared A4 assumption (Insta360 publishes no curve)
const greyCodes: Record<string, number> = {
  'Nikon_NLog_BT2020_to_Rec709.cube': NIKON_N_LOG.fromReflectance(0.18),
  'GoPro_GPLog2_Rec2020_to_Rec709.cube': GOPRO_GP_LOG2.fromLinear(0.18 / 2 ** GOPRO_GP_LOG2.evCompensation),
  'Insta360_iLog_Rec2020_to_Rec709.cube': INSTA360_I_LOG.GREY_CODE_VALUE,
};
for (const [file, v] of Object.entries(greyCodes)) {
  const lut = luts.get(file);
  assert.ok(lut, `${file} missing from the generated set`);
  assert.ok(v > 0.2 && v < 0.8, `${file}: grey code value ${v} is outside any plausible log curve`);
  const [r] = neutralAt(lut, v);
  // 33³ snaps to the nearest 1/32 node, so allow the slope-driven error across half a step.
  assert.ok(
    Math.abs(r - REC709_MIDDLE_GREY) < 0.05,
    `${file}: 18% grey should land near Rec.709 middle grey ${REC709_MIDDLE_GREY.toFixed(4)}, got ${r.toFixed(4)}`,
  );
  assert.ok(r > 0.3 && r < 0.55, `${file}: grey at ${r.toFixed(4)} is outside the plausible Rec.709 band`);
}

// ── 5. Diffuse white (100% scene reflectance) reaches display white on the Nikon curve ─
// Nikon's spec defines y as reflectance, so y = 1 is the 100% reflector = Rec.709 white.
{
  const lut = luts.get('Nikon_NLog_BT2020_to_Rec709.cube')!;
  // The nearest 33³ node can land just under the clip point, so assert "essentially white".
  const [r] = neutralAt(lut, NIKON_N_LOG.fromReflectance(1));
  assert.ok(r >= 0.95, `N-Log 100% reflectance should reach display white, got ${r.toFixed(4)}`);
  // …and one stop under diffuse white must still be below it, i.e. the curve is not all clip.
  const [under] = neutralAt(lut, NIKON_N_LOG.fromReflectance(0.5));
  assert.ok(under > 0.6 && under < 0.95, `N-Log 50% reflectance should sit between grey and white, got ${under.toFixed(4)}`);
}

// ── 6. Registry wiring: each generated file is mounted by exactly one LUT effect ───────
for (const profile of PROFILES) {
  const entries = Object.values(LUT_EFFECTS).filter((d) => d.cube === `/luts/${profile.file}`);
  assert.equal(entries.length, 1, `expected exactly one LUT_EFFECTS entry mounting /luts/${profile.file}`);
  const def = entries[0];
  assert.ok(def.props?.some((p) => p.key === 'intensity'), `${def.id} should expose an intensity prop`);
  assert.ok(def.name.includes('Rec.709'), `${def.id} should be named as a Rec.709 conversion`);
}

console.log(
  `conversion-luts: ok (${PROFILES.length} generated 33³ cubes: byte-identical to the generator, ` +
    `neutral axis monotonic, 18% grey → ${REC709_MIDDLE_GREY.toFixed(4)}, registry wired)`,
);
