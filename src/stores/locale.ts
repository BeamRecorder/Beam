import { defineStore } from 'pinia';
import { ref } from 'vue';
import { capture } from '../api/capture';
import { getCurrentLocale, setCurrentLocale } from '../i18n';
import { isSupportedLocale } from '../i18n/locales';
import type { AppLocale } from '../i18n/types';

export const useLocaleStore = defineStore('locale', () => {
  const locale = ref<AppLocale>(getCurrentLocale() as AppLocale);

  const applyLocale = async (lang: AppLocale, persistToCapture = true) => {
    if (!isSupportedLocale(lang)) return;
    if (!(await setCurrentLocale(lang))) return;
    if (locale.value !== lang) {
      locale.value = lang;
    }
    if (persistToCapture && typeof capture?.updatePreferences === 'function') {
      void capture.updatePreferences({ extras: { locale: lang } }).catch(() => undefined);
    }
  };

  function setLocale(lang: AppLocale) {
    return applyLocale(lang, true);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === 'locale' && event.newValue && isSupportedLocale(event.newValue)) {
        void applyLocale(event.newValue as AppLocale, false).catch(console.error);
      }
    });

    window.addEventListener('focus', () => {
      try {
        const stored = localStorage.getItem('locale');
        if (stored && isSupportedLocale(stored) && stored !== locale.value) {
          void applyLocale(stored as AppLocale, false).catch(console.error);
        }
      } catch {}
    });
  }

  if (typeof capture?.getPreferences === 'function') {
    void capture
      .getPreferences()
      .then((preferences) => {
        const prefLocale = preferences?.extras?.locale;
        if (typeof prefLocale === 'string' && isSupportedLocale(prefLocale)) {
          return applyLocale(prefLocale as AppLocale, false);
        }
      })
      .catch(() => undefined);
  }

  if (typeof capture?.onPreferencesChanged === 'function') {
    capture.onPreferencesChanged((preferences) => {
      const prefLocale = preferences?.extras?.locale;
      if (typeof prefLocale === 'string' && isSupportedLocale(prefLocale) && prefLocale !== locale.value) {
        void applyLocale(prefLocale as AppLocale, false).catch(console.error);
      }
    });
  }

  return {
    locale,
    setLocale,
  };
});
