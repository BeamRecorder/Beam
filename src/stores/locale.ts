import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getCurrentLocale, setCurrentLocale } from '../i18n';
import type { AppLocale } from '../i18n/types';

export const useLocaleStore = defineStore('locale', () => {
  const locale = ref<AppLocale>(getCurrentLocale() as AppLocale);

  function setLocale(lang: AppLocale) {
    locale.value = lang;
    setCurrentLocale(lang);
  }

  return {
    locale,
    setLocale,
  };
});
