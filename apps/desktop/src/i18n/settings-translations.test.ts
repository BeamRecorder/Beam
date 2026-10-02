import { afterEach, describe, expect, it } from 'vitest';
import { i18n, setCurrentLocale } from './index';
import { SUPPORTED_LOCALES } from './locales';
import { SETTINGS_CATEGORIES, settingsSearchEntries } from '~/components/hud/settings/settings-catalog';

afterEach(() => setCurrentLocale('en'));

describe('settings translations', () => {
  it.each(SUPPORTED_LOCALES)('provides navigation, search and accurate About copy in %s', async (locale) => {
    await setCurrentLocale(locale);
    const keys = [
      ...SETTINGS_CATEGORIES.flatMap(({ label, description }) => [label, description]),
      'searchSettings',
      'clearSearch',
      'searchResults',
      'resultCount',
      'noSearchResults',
      'searchHint',
      'showMoreResults',
      'recorderAlwaysOnTopDesc',
      'versionUnavailable',
      'aboutDescriptionTitle',
      'aboutDescriptionText',
      'mascotLab',
      'mascotLabDescription',
      'openMascotLab',
    ];
    for (const key of keys) {
      const path = `HudPreferences.${key}`;
      expect(i18n.global.te(path, locale), `${locale}: ${path}`).toBe(true);
      expect(i18n.global.t(path, { query: 'Beam', count: 40, version: '0.4.0' }).trim()).not.toBe('');
    }
    expect(i18n.global.t('HudPreferences.resultCount', { count: 40 })).toContain('40');
  });

  it('resolves every indexed title, description and option in each supported language and English', async () => {
    for (const locale of SUPPORTED_LOCALES) {
      await setCurrentLocale(locale);
      const translate = (key: string) => {
        expect(i18n.global.te(key, locale), `${locale}: ${key}`).toBe(true);
        return i18n.global.t(key, { version: '0.4.0' });
      };
      const english = (key: string) => {
        expect(i18n.global.te(key, 'en'), `en: ${key}`).toBe(true);
        return i18n.global.t(key, { version: '0.4.0' }, { locale: 'en' });
      };
      const entries = settingsSearchEntries(translate, english);
      for (const entry of entries) {
        expect(entry.title.trim()).not.toBe('');
        expect(entry.description.trim()).not.toBe('');
      }
    }
  });
});
