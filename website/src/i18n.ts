import { createI18n } from 'vue-i18n';
import englishWebsiteMessages from './i18n/en/website.json';

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
type WebsiteModuleLoader = () => Promise<LocaleMessages>;

const websiteModules = import.meta.glob('./i18n/*/website.json', {
  import: 'default',
}) as Record<string, WebsiteModuleLoader>;

const loadedWebsiteMessages = new Map<WebsiteLocale, LocaleMessages>([['en', englishWebsiteMessages]]);
const websiteMessageRequests = new Map<WebsiteLocale, Promise<LocaleMessages>>();

export const loadWebsiteLocaleMessages = async (locale: WebsiteLocale): Promise<LocaleMessages> => {
  const loaded = loadedWebsiteMessages.get(locale);
  if (loaded) return loaded;

  const loader = websiteModules[`./i18n/${locale}/website.json`];
  if (!loader) throw new Error(`Missing i18n catalogue: ${locale}/website.json`);
  const activeRequest = websiteMessageRequests.get(locale);
  if (activeRequest) return activeRequest;

  const request = loader()
    .then((messages) => {
      loadedWebsiteMessages.set(locale, messages);
      return messages;
    })
    .finally(() => websiteMessageRequests.delete(locale));
  websiteMessageRequests.set(locale, request);
  return request;
};

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

export const createWebsiteI18n = (locale: WebsiteLocale = 'en') =>
  createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'en',
    messages: { en: { Website: englishWebsiteMessages } } as Record<string, { Website: LocaleMessages }>,
  });

export type WebsiteI18n = ReturnType<typeof createWebsiteI18n>;

export const websiteI18n = createWebsiteI18n();

export const loadWebsiteLocale = async (i18n: WebsiteI18n, locale: WebsiteLocale) => {
  if (!i18n.global.availableLocales.includes(locale)) {
    i18n.global.setLocaleMessage(locale, { Website: await loadWebsiteLocaleMessages(locale) });
  }
};

export const syncWebsiteLocale = async (locale: WebsiteLocale) => {
  try {
    await loadWebsiteLocale(websiteI18n, locale);
    websiteI18n.global.locale.value = locale;
    document.documentElement.lang = locale;
    localStorage.setItem('locale', locale);
  } finally {
    delete document.documentElement.dataset.localePending;
  }
};
