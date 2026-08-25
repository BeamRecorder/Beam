import type { WebsiteLocale } from '../../../src/i18n';

export const docsLocaleOptions = [
  { locale: 'en', lang: 'en-US', label: 'English' },
  { locale: 'bg', lang: 'bg-BG', label: 'Български' },
  { locale: 'de', lang: 'de-DE', label: 'Deutsch' },
  { locale: 'es', lang: 'es-ES', label: 'Español' },
  { locale: 'fr', lang: 'fr-FR', label: 'Français' },
  { locale: 'hi', lang: 'hi-IN', label: 'हिन्दी' },
  { locale: 'it', lang: 'it-IT', label: 'Italiano' },
  { locale: 'ja', lang: 'ja-JP', label: '日本語' },
  { locale: 'ko', lang: 'ko-KR', label: '한국어' },
  { locale: 'pl', lang: 'pl-PL', label: 'Polski' },
  { locale: 'pt-BR', lang: 'pt-BR', label: 'Português (Brasil)' },
  { locale: 'ru', lang: 'ru-RU', label: 'Русский' },
  { locale: 'vi', lang: 'vi-VN', label: 'Tiếng Việt' },
  { locale: 'zh-CN', lang: 'zh-CN', label: '简体中文' },
  { locale: 'zh-TW', lang: 'zh-TW', label: '繁體中文' },
] as const satisfies readonly { locale: WebsiteLocale; lang: string; label: string }[];

export type DocsLocale = (typeof docsLocaleOptions)[number]['locale'];

export const enabledDocsLocales = docsLocaleOptions.map(({ locale }) => locale) as DocsLocale[];

export const docsLocaleFromPath = (relativePath: string): DocsLocale => {
  const prefix = relativePath.split('/')[0];
  return enabledDocsLocales.includes(prefix as DocsLocale) ? (prefix as DocsLocale) : 'en';
};
