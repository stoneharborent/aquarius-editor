// Language state + t(): the English source string is the key (no separate key namespace),
// so an untranslated locale always falls back to readable English — never a blank string.
// The choice is persisted in localStorage('cc.locale') and re-renders subscribers through
// useSyncExternalStore.
// Rules: use useT() inside React components (it subscribes to language switches); plain helper
//  modules may import { t } directly — as long as the component rendering their output calls
//  useT(), the text is recomputed when the language changes.
// LLM surfaces (systemPrompt / tool descriptions / skill bodies) and persisted dynamic history
// labels stay out of i18n.
// Default language: the saved choice wins; otherwise the system language (zh/it/ru), and English
// for everything else.
import { useSyncExternalStore } from 'react';
import { IT } from './dict/it';
import IT_DATA from './dict/it/templates-data';
import { RU } from './dict/ru';
import { ZH_DATA } from './dict/zh';
import { ZH } from './dict/zh/ui';

export type Locale = 'zh' | 'en' | 'it' | 'ru';

export const ALL_LOCALES: readonly Locale[] = ['zh', 'en', 'it', 'ru'];

/** English is the source language: an English string needs no dictionary lookup. */
export const SOURCE_LOCALE: Locale = 'en';

const STORAGE_KEY = 'cc.locale';
const DOCUMENT_LANG: Record<Locale, string> = {
  zh: 'zh-CN',
  en: 'en',
  it: 'it',
  ru: 'ru',
};

function systemLocale(): Locale {
  try {
    const tag = String(navigator.language ?? '').toLowerCase();
    if (tag.startsWith('zh')) return 'zh';
    if (tag.startsWith('it')) return 'it';
    if (tag.startsWith('ru')) return 'ru';
    return SOURCE_LOCALE;
  } catch {
    return SOURCE_LOCALE;
  }
}

function readInitial(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'zh' || stored === 'en' || stored === 'it' || stored === 'ru') return stored;
  } catch {
    // Private mode / storage disabled → system language below.
  }
  return systemLocale();
}

let current: Locale = readInitial();
if (typeof document !== 'undefined') document.documentElement.lang = DOCUMENT_LANG[current];
const subscribers = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

export function localeLanguageName(locale: Locale): 'Chinese' | 'English' | 'Italian' | 'Russian' {
  if (locale === 'zh') return 'Chinese';
  if (locale === 'it') return 'Italian';
  if (locale === 'ru') return 'Russian';
  return 'English';
}

export function setLocale(next: Locale): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch { /* Private mode cannot persist; only this session is affected. */ }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = DOCUMENT_LANG[next];
  }
  subscribers.forEach((notify) => notify());
}

/** t('Selected {n}', { n: 3 }) — the English source text is the key; {name} placeholders keep
 * the same name in every language. */
export function t(en: string, params?: Record<string, string | number>): string {
  const raw = current === 'zh' ? (ZH[en] ?? en)
    : current === 'it' ? (IT[en] ?? en)
      : current === 'ru' ? (RU[en] ?? en) : en;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}

/** Localization for **data** names (template names, sound names, music tags …): looks the English
 * canonical name up in the active language and returns it unchanged when there is no entry.
 * Display only — the underlying data (where the name doubles as a lookup key) never changes. */
export function tData(text: string): string {
  if (current === 'zh') return ZH_DATA[text] ?? text;
  if (current === 'it') return IT_DATA[text] ?? text;
  return text;
}

/** Get t inside a component: subscribes to language switches so the component re-renders. */
export function useT(): typeof t {
  useSyncExternalStore(
    (onChange) => {
      subscribers.add(onChange);
      return () => subscribers.delete(onChange);
    },
    () => current,
  );
  return t;
}
