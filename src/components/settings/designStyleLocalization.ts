import { DESIGN_STYLE_PRESETS } from '../../editor/design-presets';
import type { Locale } from '../../i18n/locale';
import {
  PRESET_NAME_ZH,
  PRESET_GUIDE_ZH,
  ROLE_ZH,
  FONT_ROLE_ZH,
} from '../../i18n/dict/zh/design-style';

const GUIDE_ZH_BY_SOURCE = new Map(
  DESIGN_STYLE_PRESETS
    .filter((preset) => preset.style.styleGuide && PRESET_GUIDE_ZH[preset.name])
    .map((preset) => [preset.style.styleGuide as string, PRESET_GUIDE_ZH[preset.name]]),
);

export function localizeDesignPresetName(name: string, locale: Locale): string {
  return locale === 'zh' ? (PRESET_NAME_ZH[name] ?? name) : name;
}
export function localizeDesignRole(role: string, locale: Locale): string {
  return locale === 'zh' ? (ROLE_ZH[role] ?? role) : role;
}

export function localizeDesignFontRole(role: string, locale: Locale): string {
  return locale === 'zh' ? (FONT_ROLE_ZH[role] ?? role) : role;
}

export function localizeDesignStyleGuide(guide: string, locale: Locale): string {
  return locale === 'zh' ? (GUIDE_ZH_BY_SOURCE.get(guide) ?? guide) : guide;
}
