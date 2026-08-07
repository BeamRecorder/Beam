import type { Locale } from 'vue-i18n';
import type { Ref } from 'vue';

export type AppLocale =
  'en' | 'fr' | 'es' | 'de' | 'ru' | 'bg' | 'zh-CN' | 'ko' | 'pt-BR' | 'ja' | 'it' | 'pl' | 'zh-TW' | 'hi';

export interface WrappedI18n {
  t: (key: string, params?: Record<string, unknown>) => string;
  locale: Ref<Locale>;
  availableLocales: Locale[];
}
