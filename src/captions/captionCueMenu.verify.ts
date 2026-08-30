import assert from 'node:assert/strict';
import { appendManualCue, newManualCaptions } from './manualCaptions';

const modulePath = './captionCueMenu';
const { captionCueText, replaceCaptionCueText } = await import(modulePath).catch(() => {
  assert.fail('caption cue menu helpers must exist as a caption-owned data layer');
});

let captions = newManualCaptions();
const laneId = captions.sourceEntries![0]!.id;
captions = { ...captions, ...appendManualCue(captions, laneId, '  Original cue  ', 1_000, 2_000) };
const words = captions.sourceEntries![0]!.words!;
const target = { laneId, index: 0, words };

assert.equal(captionCueText(target), 'Original cue', 'menu copy actions should receive trimmed cue text');

const patch = replaceCaptionCueText(captions, target, '  Replacement  ');
assert.equal(patch?.sourceEntries?.[0]?.words?.[0]?.text, 'Replacement', 'editing a cue should preserve its timing and replace its text');
assert.equal(
  patch?.sourceEntries?.[0]?.words?.[0]?.id,
  words[0]?.id,
  'editing a cue must preserve its persistent cue identity',
);
assert.equal(replaceCaptionCueText(captions, target, '   '), null, 'blank replacement text must not destroy a cue');

console.log('captionCueMenu.verify: caption cue menu data helpers OK');
