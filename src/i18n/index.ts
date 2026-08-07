import { createI18n } from 'vue-i18n';
import enCore from './en/core.json';
import enEditor from './en/editor.json';
import frCore from './fr/core.json';
import frEditor from './fr/editor.json';
import esCore from './es/core.json';
import esEditor from './es/editor.json';
import deCore from './de/core.json';
import deEditor from './de/editor.json';
import ruCore from './ru/core.json';
import ruEditor from './ru/editor.json';
import bgCore from './bg/core.json';
import bgEditor from './bg/editor.json';
import zhCnCore from './zh-CN/core.json';
import zhCnEditor from './zh-CN/editor.json';
import koCore from './ko/core.json';
import koEditor from './ko/editor.json';
import { isSupportedLocale } from './locales';
import type { AppLocale } from './types';

const messages = {
  en: {
    ...enCore,
    ...enEditor,
  },
  fr: {
    ...frCore,
    ...frEditor,
  },
  es: {
    ...esCore,
    ...esEditor,
  },
  de: {
    ...deCore,
    ...deEditor,
  },
  ru: {
    ...ruCore,
    ...ruEditor,
  },
  bg: {
    ...bgCore,
    ...bgEditor,
  },
  'zh-CN': {
    ...zhCnCore,
    ...zhCnEditor,
  },
  ko: {
    ...koCore,
    ...koEditor,
  },
};

function detectLocale(): AppLocale {
  try {
    const stored = localStorage.getItem('locale');
    if (stored && isSupportedLocale(stored)) return stored;
    const navLang = navigator.language.toLowerCase();
    const normalized = navLang.startsWith('zh') ? 'zh-CN' : navLang.split('-')[0];
    if (isSupportedLocale(normalized)) return normalized;
  } catch {}
  return 'en';
}

function syncDocumentLanguage(locale: AppLocale) {
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

const initialLocale = detectLocale();

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'en',
  messages,
});
syncDocumentLanguage(initialLocale);

export function initI18n() {
  return i18n;
}

export function getCurrentLocale(): string {
  return i18n.global.locale.value;
}

export function setCurrentLocale(locale: AppLocale) {
  i18n.global.locale.value = locale;
  syncDocumentLanguage(locale);
  try {
    localStorage.setItem('locale', locale);
  } catch {}
}

export function tNamespace(ns: string) {
  return (key: string, params?: Record<string, unknown>) =>
    params ? i18n.global.t(`${ns}.${key}`, params as Record<string, any>) : i18n.global.t(`${ns}.${key}`);
}
