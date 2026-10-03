import { createI18n } from 'vue-i18n';
import enCore from './en/core.json';
import enEditor from './en/editor.json';
import { isSupportedLocale } from './locales';
import type { AppLocale } from './types';
import { createLocaleLoader } from './locale-loader';
import { detectLocale } from './locale-detection';
import type { CoreMessages, EditorMessages, LocaleMessages } from './locale-message-types';

const english = { ...enCore, ...enEditor };
const loadLocale = createLocaleLoader(
  import.meta.glob<CoreMessages>('./*/core.json', { import: 'default' }),
  import.meta.glob<EditorMessages>('./*/editor.json', { import: 'default' }),
  english,
);

function syncDocumentLanguage(locale: AppLocale) {
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

const initialLocale = detectLocale();

const messages: Partial<Record<AppLocale, LocaleMessages>> = { en: english };

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages,
});
syncDocumentLanguage('en');
let localeGeneration = 0;
const initialLocaleReady = setCurrentLocale(initialLocale);

export async function initI18n() {
  await initialLocaleReady;
  return i18n;
}

export function getCurrentLocale(): string {
  return i18n.global.locale.value;
}

export async function setCurrentLocale(locale: AppLocale): Promise<boolean> {
  if (!isSupportedLocale(locale)) throw new Error(`Unsupported locale: ${locale}`);
  const generation = ++localeGeneration;
  if (!i18n.global.availableLocales.includes(locale)) {
    const messages = await loadLocale(locale);
    i18n.global.setLocaleMessage(locale, messages);
  }
  if (generation !== localeGeneration) return false;
  i18n.global.locale.value = locale;
  syncDocumentLanguage(locale);
  try {
    localStorage.setItem('locale', locale);
  } catch {}
  return true;
}

export function tNamespace(ns: string) {
  return (key: string, params?: Record<string, unknown>) =>
    params ? i18n.global.t(`${ns}.${key}`, params as Record<string, any>) : i18n.global.t(`${ns}.${key}`);
}
