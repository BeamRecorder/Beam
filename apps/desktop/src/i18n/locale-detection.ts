import { isSupportedLocale } from './locales';
import type { AppLocale } from './types';

export function detectLocale(): AppLocale {
  try {
    const stored = localStorage.getItem('locale');
    if (stored && isSupportedLocale(stored)) return stored;
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const language of languages) {
      const normalized = language.toLowerCase();
      const locale =
        normalized.startsWith('zh-tw') || normalized.startsWith('zh-hk')
          ? 'zh-TW'
          : normalized.startsWith('zh')
            ? 'zh-CN'
            : normalized.startsWith('pt-br')
              ? 'pt-BR'
              : normalized.split('-')[0]!;
      if (isSupportedLocale(locale)) return locale;
    }
  } catch {}
  return 'en';
}
