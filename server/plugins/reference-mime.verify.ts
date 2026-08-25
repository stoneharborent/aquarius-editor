// Runnable check: `npx tsx server/plugins/reference-mime.verify.ts`.
//
// Exercises the real code path: writes several temporary files with different
// extensions into the upload directory, then calls the actual reference-asset
// mediaDataUrl() and asserts that the data: prefix reports the **real type**.
//
// There used to be a copy of the MIME table here that only recognized 6
// extensions, with everything else falling back to image/jpeg - `.heic`,
// `.avif`, `.gif`, `.mov` can all legitimately land in /media/uploads and were
// getting mislabeled as image/jpeg, sending non-JPEG bytes to the vendor
// under a JPEG content type.
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { uploadDir } from '../media-dir.ts';
import { mediaDataUrl } from './video-media.ts';

const dir = uploadDir();
await mkdir(dir, { recursive: true });

const CASES: Array<[ext: string, mime: string]> = [
  ['mov', 'video/quicktime'],
  ['heic', 'image/heic'],
  ['heif', 'image/heif'],
  ['avif', 'image/avif'],
  ['gif', 'image/gif'],
  ['m4v', 'video/mp4'],
  ['m4a', 'audio/mp4'],
  ['flac', 'audio/flac'],
  // The ones that are already recognized must remain unchanged.
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['mp4', 'video/mp4'],
  ['wav', 'audio/wav'],
  ['jpg', 'image/jpeg'],
];

const written: string[] = [];
try {
  for (const [ext, mime] of CASES) {
    const name = `verify-mime-probe.${ext}`;
    const file = join(dir, name);
    await writeFile(file, Buffer.from([1, 2, 3, 4]));
    written.push(file);
    const url = await mediaDataUrl(`/media/uploads/${name}`);
    assert.ok(
      url.startsWith(`data:${mime};base64,`),
      `.${ext} should be labeled ${mime}, got ${url.slice(0, url.indexOf(';base64'))}`,
    );
  }
  console.log(`reference-mime.verify: ok (all ${CASES.length} extensions got their real type, none fell back to image/jpeg)`);
} finally {
  await Promise.all(written.map((file) => rm(file, { force: true })));
}
