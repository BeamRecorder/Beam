import { createI18n } from 'vue-i18n';

export const WEBSITE_LOCALES = [
  'en',
  'fr',
  'es',
  'de',
  'ru',
  'bg',
  'zh-CN',
  'ko',
  'pt-BR',
  'ja',
  'it',
  'pl',
  'zh-TW',
  'hi',
  'vi',
] as const;

export type WebsiteLocale = (typeof WEBSITE_LOCALES)[number];

type LocaleMessages = Record<string, unknown>;

const websiteModules = import.meta.glob('./i18n/*/website.json', {
  eager: true,
  import: 'default',
}) as Record<string, LocaleMessages>;

const moduleFor = (modules: Record<string, LocaleMessages>, locale: WebsiteLocale, file: string) => {
  const entry = Object.entries(modules).find(([path]) => path.endsWith(`/${locale}/${file}.json`));
  if (!entry) throw new Error(`Catalogue i18n manquant : ${locale}/${file}.json`);
  return entry[1];
};

const messages = Object.fromEntries(
  WEBSITE_LOCALES.map((locale) => [
    locale,
    {
      Website: moduleFor(websiteModules, locale, 'website'),
    },
  ]),
);

const isWebsiteLocale = (value: string): value is WebsiteLocale =>
  (WEBSITE_LOCALES as readonly string[]).includes(value);

export const normalizeWebsiteLocale = (language: string): WebsiteLocale | null => {
  const normalized = language.toLowerCase();
  const candidate =
    normalized.startsWith('zh-tw') || normalized.startsWith('zh-hk')
      ? 'zh-TW'
      : normalized.startsWith('zh')
        ? 'zh-CN'
        : normalized.startsWith('pt-br')
          ? 'pt-BR'
          : normalized.split('-')[0];
  return isWebsiteLocale(candidate) ? candidate : null;
};

export const detectWebsiteLocale = (): WebsiteLocale => {
  try {
    const stored = localStorage.getItem('locale');
    if (stored && isWebsiteLocale(stored)) return stored;
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const language of languages) {
      const locale = normalizeWebsiteLocale(language);
      if (locale) return locale;
    }
  } catch {}
  return 'en';
};

const initialLocale = detectWebsiteLocale();

export const createWebsiteI18n = (locale: WebsiteLocale = 'en') =>
  createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'en',
    messages,
  });

export const websiteI18n = createWebsiteI18n(initialLocale);

export const syncWebsiteLocale = (locale: WebsiteLocale) => {
  websiteI18n.global.locale.value = locale;
  document.documentElement.lang = locale;
  localStorage.setItem('locale', locale);
};
