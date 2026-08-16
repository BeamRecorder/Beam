import { createI18n } from 'vue-i18n';
import enCore from '../../src/i18n/en/core.json';
import enEditor from '../../src/i18n/en/editor.json';

export const websiteI18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: {
    en: {
      ...enCore,
      ...enEditor,
    },
  },
});
