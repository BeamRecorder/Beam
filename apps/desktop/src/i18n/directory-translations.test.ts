import { afterEach, expect, it } from 'vitest';
import { i18n, setCurrentLocale } from './index';
import { SUPPORTED_LOCALES } from './locales';
const keys = [
  'projects',
  'projectsDescription',
  'exports',
  'exportsDescription',
  'defaultLocation',
  'lastUsed',
  'browse',
  'search',
  'noMatches',
  'error',
  'retry',
];
afterEach(() => setCurrentLocale('en'));
it.each(SUPPORTED_LOCALES)('translates directory settings and folder controls in %s', async (locale) => {
  await setCurrentLocale(locale);
  for (const name of keys) {
    const key = `DirectoryPreferences.${name}`;
    expect(i18n.global.te(key, locale)).toBe(true);
    expect(i18n.global.t(key)).not.toBe(key);
  }
  for (const category of ['studio', 'instant', 'screenshot'])
    expect(i18n.global.t('DirectoryPreferences.projectsDescription')).toContain(`projects/${category}`);
});
