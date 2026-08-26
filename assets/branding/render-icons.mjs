// Regenerates every Aquarius Editor application icon from the AquariusOS logo.
//
// Source of truth: ../../../os-image/branding/logo.svg (the AquariusOS mark).
// Colours come from ../../../os-image/branding/tokens.md — `void` #06070C is the
// icon plate, and nothing here may invent a colour that is not in that file.
//
// Run it from the repo root:
//   export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
//   node assets/branding/render-icons.mjs
//
// What it writes (everything below is generated — never hand-edit these files):
//   assets/branding/icons/<size>x<size>.png   Linux icon set (electron-builder linux.icon)
//   assets/branding/aquarius-editor-icon.icns    macOS icon (electron-builder mac.icon)
//   assets/branding/aquarius-editor-icon.ico     Windows icon (electron-builder win.icon)
//   public/aquarius-editor-icon.png              web favicon + generic 1024px PNG
//
// macOS conversion uses `iconutil`, which ships with Xcode's command line tools.

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const logoSvg = path.resolve(repoRoot, '../os-image/branding/logo.svg');

const PLATE = '#06070C';        // token: void
const MASTER = 1024;            // everything is downscaled from this
const CORNER_RATIO = 0.2237;    // macOS-style rounded square
const MARK_RATIO = 0.58;        // the mark fills 58% of the plate (≈80% safe area with the plate's own padding)
const PNG_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];
const ICO_SIZES = [16, 32, 48, 64, 128, 256];
// macOS wants each size at 1x and 2x inside the .iconset folder.
const ICNS_ENTRIES = [
  ['icon_16x16.png', 16], ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32], ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128], ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256], ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512], ['icon_512x512@2x.png', 1024],
];

function plateSvg(size) {
  const radius = Math.round(size * CORNER_RATIO);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`
    + `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${PLATE}"/>`
    + '</svg>',
  );
}

/** Render the logo, trim its transparent margin, and scale the bare mark to `box` px. */
async function markPng(box) {
  const rendered = await sharp(logoSvg, { density: 900 })
    .resize({ width: MASTER * 2, height: MASTER * 2, fit: 'contain', background: '#00000000' })
    .png()
    .toBuffer();
  return sharp(rendered)
    .trim({ background: '#00000000', threshold: 0 })
    .resize({ width: box, height: box, fit: 'inside', background: '#00000000' })
    .png()
    .toBuffer();
}

async function master() {
  const mark = await markPng(Math.round(MASTER * MARK_RATIO));
  return sharp(plateSvg(MASTER))
    .composite([{ input: mark, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Build an .ico container. Every entry is a PNG payload, which Windows Vista+ reads natively. */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);            // reserved
  header.writeUInt16LE(1, 2);            // type: icon
  header.writeUInt16LE(entries.length, 4);
  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;
  entries.forEach(({ size, data }, index) => {
    const at = index * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, at);       // width (0 means 256)
    directory.writeUInt8(size >= 256 ? 0 : size, at + 1);   // height
    directory.writeUInt8(0, at + 2);                        // palette colours
    directory.writeUInt8(0, at + 3);                        // reserved
    directory.writeUInt16LE(1, at + 4);                     // colour planes
    directory.writeUInt16LE(32, at + 6);                    // bits per pixel
    directory.writeUInt32LE(data.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, directory, ...entries.map((entry) => entry.data)]);
}

const source = await master();
const resize = (size) => sharp(source).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

// Linux: a folder of square PNGs, which electron-builder reads directly.
const iconsDir = path.join(here, 'icons');
rmSync(iconsDir, { recursive: true, force: true });
mkdirSync(iconsDir, { recursive: true });
for (const size of PNG_SIZES) {
  writeFileSync(path.join(iconsDir, `${size}x${size}.png`), await resize(size));
}

// Web favicon / generic PNG.
writeFileSync(path.join(repoRoot, 'public', 'aquarius-editor-icon.png'), source);

// Windows.
const icoEntries = [];
for (const size of ICO_SIZES) icoEntries.push({ size, data: await resize(size) });
writeFileSync(path.join(here, 'aquarius-editor-icon.ico'), buildIco(icoEntries));

// macOS.
const iconset = path.join(here, 'aquarius-editor.iconset');
rmSync(iconset, { recursive: true, force: true });
mkdirSync(iconset, { recursive: true });
for (const [name, size] of ICNS_ENTRIES) {
  writeFileSync(path.join(iconset, name), await resize(size));
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(here, 'aquarius-editor-icon.icns')]);
rmSync(iconset, { recursive: true, force: true });

console.log('icons rendered from', path.relative(repoRoot, logoSvg));
