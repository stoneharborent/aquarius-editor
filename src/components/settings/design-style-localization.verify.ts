import assert from 'node:assert/strict';
import { DESIGN_STYLE_PRESETS } from '../../editor/design-presets';
import {
  localizeDesignFontRole,
  localizeDesignPresetName,
  localizeDesignRole,
  localizeDesignStyleGuide,
} from './designStyleLocalization';
import {
  FONT_ROLE_ZH,
  PRESET_GUIDE_ZH,
  PRESET_NAME_ZH,
  ROLE_ZH,
} from '../../i18n/dict/zh/design-style';

const modern = DESIGN_STYLE_PRESETS.find((preset) => preset.name === 'Modern Editorial');
assert.ok(modern, 'test data should include Modern Editorial');

assert.equal(localizeDesignPresetName(modern.name, 'zh'), PRESET_NAME_ZH['Modern Editorial']);
assert.equal(localizeDesignPresetName(modern.name, 'en'), modern.name);
assert.equal(localizeDesignRole('background-chart', 'zh'), ROLE_ZH['background-chart']);
assert.equal(localizeDesignRole('chart-warm-mid', 'zh'), ROLE_ZH['chart-warm-mid']);
assert.equal(localizeDesignRole('background-chart', 'en'), 'background-chart');
assert.equal(localizeDesignFontRole('accent', 'zh'), FONT_ROLE_ZH.accent);
assert.equal(localizeDesignFontRole('callout', 'zh'), FONT_ROLE_ZH.callout);
assert.equal(localizeDesignFontRole('impact', 'zh'), FONT_ROLE_ZH.impact);
assert.equal(localizeDesignFontRole('accent', 'en'), 'accent');
assert.equal(
  localizeDesignStyleGuide(modern.style.styleGuide ?? '', 'zh'),
  PRESET_GUIDE_ZH['Modern Editorial'],
);
assert.equal(localizeDesignStyleGuide(modern.style.styleGuide ?? '', 'en'), modern.style.styleGuide);

for (const preset of DESIGN_STYLE_PRESETS) {
  assert.notEqual(localizeDesignPresetName(preset.name, 'zh'), preset.name, `${preset.name} should have a Chinese name`);
  assert.notEqual(
    localizeDesignStyleGuide(preset.style.styleGuide ?? '', 'zh'),
    preset.style.styleGuide,
    `${preset.name} should have a Chinese style guide`,
  );
}

console.log('design-style-localization.verify: preset names, roles and guides localize to Chinese');
