import assert from 'node:assert/strict';
import type { MediaAsset } from '../editor/types';
import { matchRelinkFile } from './mediaRelinkMatch';

const file = (name: string, type = ''): File => new File([new Uint8Array([1])], name, { type });

const asset = (name: string, extra: Partial<{ sourceFilename: string; kind: string }> = {}) => ({
  name,
  sourceFilename: extra.sourceFilename,
  kind: (extra.kind ?? 'image') as MediaAsset['kind'],
});

async function main(): Promise<void> {
  // 1. Exact filename match (case-insensitive) wins.
  assert.equal(matchRelinkFile(asset('starmap.png'), [file('starmap.png')])?.name, 'starmap.png');
  assert.equal(matchRelinkFile(asset('Star.png'), [file('star.PNG')])?.name, 'star.PNG');
  // sourceFilename (original file name) is preferred over display name.
  assert.equal(
    matchRelinkFile(asset('display-name', { sourceFilename: 'original.mp4' }), [file('original.mp4'), file('display-name.mp4')])?.name,
    'original.mp4',
  );

  // 2. Stem match bridges extension changes (mp4 → mov) — the #48 report case.
  assert.equal(matchRelinkFile(asset('dance.mp4', { kind: 'video' }), [file('dance.mov')])?.name, 'dance.mov');
  assert.equal(matchRelinkFile(asset('clip.mov', { kind: 'video' }), [file('CLIP.mp4')])?.name, 'CLIP.mp4');

  // 3. Multiple stem candidates: prefer the kind-matching file.
  assert.equal(
    matchRelinkFile(asset('footage', { kind: 'audio' }), [file('footage.mp4'), file('footage.mp3')])?.name,
    'footage.mp3',
  );
  assert.equal(
    matchRelinkFile(asset('footage', { kind: 'video' }), [file('footage.mp4'), file('footage.mp3')])?.name,
    'footage.mp4',
  );
  assert.equal(
    matchRelinkFile(asset('script', { kind: 'document' }), [file('script.psd'), file('script.md')])?.name,
    'script.md',
  );

  // 4. Ambiguous stems with no kind match → null (no silent wrong relink).
  assert.equal(matchRelinkFile(asset('footage', { kind: 'image' }), [file('footage.mp4'), file('footage.mp3')]), null);

  // 5. No name / no match → null.
  assert.equal(matchRelinkFile(asset(''), [file('x.png')]), null);
  assert.equal(matchRelinkFile(asset('missing.png'), [file('other.png')]), null);

  // 6. Exact match beats stem match even when stems collide.
  assert.equal(
    matchRelinkFile(asset('a.png'), [file('a.png'), file('a.jpg')])?.name,
    'a.png',
  );

  console.log('mediaRelinkMatch.verify: all assertions passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
