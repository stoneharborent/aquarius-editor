// Runnable check: `npx tsx src/components/chat/widget-parse.check.ts`
// Covers widget sample parsing + formatWidgetAnswer answer assembly + malformed-widget tolerance.
import assert from 'node:assert';
import {
  parseWidgets, formatWidgetAnswer,
  type FormMulti, type FormRichChoice, type FormSingle,
} from './widget-parse';

const REAL_EXAMPLE = `Great! Before we get started, I need a few key details:

<widget>
  <form-single id="duration" label="About how long should the video be?" options="60s|About 1 minute,180s|About 3 minutes,300s|About 5 minutes" allow_other="false"/>
  <form-single id="ratio" label="Video aspect ratio" options="16:9|Landscape 16:9,9:16|Portrait 9:16,1:1|Square"/>
  <form-multi id="content" label="Which topics should we cover? (multi-select)" options="Life story,Analysis of representative poems,Historical background & era"/>
  <form-visual id="voiceId" label="Choose a voice" required="true">
    <visual-option value="ruyayichen" name="Elegant Yichen" media="/voice-samples/doubao-ruyayichen.mp3" aspect-ratio="16:5" summary="Male / Young / Elegant and refined"/>
    <visual-option value="morgan" name="Morgan" media="/voice-samples/x.mp3" summary="..."/>
  </form-visual>
</widget>`;

// ---- Segment order + field parsing ----
const segs = parseWidgets(REAL_EXAMPLE);
assert.strictEqual(segs.length, 2, 'segment count should be 2 (text + widget)');
assert.strictEqual(segs[0].type, 'text');
assert.ok(segs[0].type === 'text' && segs[0].text.includes('Before we get started'));
assert.strictEqual(segs[1].type, 'widget');
assert.ok(segs[1].type === 'widget');
const fields = segs[1].type === 'widget' ? segs[1].fields : [];
assert.strictEqual(fields.length, 4, 'should resolve 4 fields');

const [duration, ratio, content, voiceId] = fields as [
  FormSingle,
  FormSingle,
  FormMulti,
  FormRichChoice,
];

assert.strictEqual(duration.kind, 'single');
assert.strictEqual(duration.id, 'duration');
assert.strictEqual(duration.label, 'About how long should the video be?');
assert.strictEqual(duration.allowOther, false);
assert.deepStrictEqual(duration.options, [
  { value: '60s', display: 'About 1 minute' },
  { value: '180s', display: 'About 3 minutes' },
  { value: '300s', display: 'About 5 minutes' },
]);

assert.strictEqual(ratio.kind, 'single');
assert.strictEqual(ratio.allowOther, false, 'allow_other should default to false');
assert.deepStrictEqual(ratio.options, [
  { value: '16:9', display: 'Landscape 16:9' },
  { value: '9:16', display: 'Portrait 9:16' },
  { value: '1:1', display: 'Square' },
]);

assert.strictEqual(content.kind, 'multi');
assert.deepStrictEqual(content.options, [
  { value: 'Life story', display: 'Life story' },
  { value: 'Analysis of representative poems', display: 'Analysis of representative poems' },
  { value: 'Historical background & era', display: 'Historical background & era' },
]);

assert.strictEqual(voiceId.kind, 'visual');
assert.strictEqual(voiceId.required, true);
assert.strictEqual(voiceId.options.length, 2);
assert.deepStrictEqual(voiceId.options[0], {
  value: 'ruyayichen',
  name: 'Elegant Yichen',
  media: '/voice-samples/doubao-ruyayichen.mp3',
  description: 'Male / Young / Elegant and refined',
  aspectRatio: '16:5',
  submitPrompt: undefined,
});
assert.deepStrictEqual(voiceId.options[1], {
  value: 'morgan',
  name: 'Morgan',
  media: '/voice-samples/x.mp3',
  description: '...',
  aspectRatio: undefined,
  submitPrompt: undefined,
});

// ---- formatWidgetAnswer ----
const answer = formatWidgetAnswer(fields, {
  duration: '180s',
  ratio: '16:9',
  content: ['Life story', 'Analysis of representative poems'],
  voiceId: 'ruyayichen',
});
assert.strictEqual(
  answer,
  [
    '- About how long should the video be?: About 3 minutes',
    '- Video aspect ratio: Landscape 16:9',
    '- Which topics should we cover? (multi-select): Life story, Analysis of representative poems',
    '- Choose a voice: Elegant Yichen',
  ].join('\n'),
);

// Unanswered fields should be skipped; free text from allow_other should be shown as-is
const partial = formatWidgetAnswer(fields, { duration: 'a custom two minutes' });
assert.strictEqual(partial, '- About how long should the video be?: a custom two minutes');

// ---- Plain text with no widget: the whole segment is returned as-is ----
const plain = parseWidgets('This is an ordinary reply, with no form.');
assert.strictEqual(plain.length, 1);
assert.deepStrictEqual(plain[0], { type: 'text', text: 'This is an ordinary reply, with no form.' });

// ---- Malformed widget: when no fields can be resolved, strip the markup instead of throwing (untrusted model output must not leave markup behind) ----
const malformed = 'text before<widget><form-single id="x"/></widget>text after';
assert.doesNotThrow(() => parseWidgets(malformed));
const malformedSegs = parseWidgets(malformed);
assert.strictEqual(malformedSegs.length, 2);
assert.deepStrictEqual(malformedSegs[0], { type: 'text', text: 'text before' });
assert.deepStrictEqual(malformedSegs[1], { type: 'text', text: 'text after' });

// ---- An empty widget (no fields) is likewise stripped, leaving no markup behind ----
const empty = '<widget></widget>';
assert.doesNotThrow(() => parseWidgets(empty));
assert.deepStrictEqual(parseWidgets(empty), []);

console.log('widget-parse.check: ok');
