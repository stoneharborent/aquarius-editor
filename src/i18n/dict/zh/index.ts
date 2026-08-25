// ZH data dictionary assembly: Chinese display name for English-keyed **data**
// (template names, sound names, music tags). Used by tData(), not by t().
import templates from './templates';
import templatesData from './templates-data';
import sounds from './sounds';
import music from './music';

export const ZH_DATA: Record<string, string> = Object.assign({}, templates, templatesData, sounds, music);

/** Native label for the Chinese locale, shown in the language switcher in every locale. */
export const ZH_LOCALE_LABEL = '中';
