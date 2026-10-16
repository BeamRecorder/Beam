import { afterEach, expect, it } from 'vitest';
import { i18n, setCurrentLocale } from './index';
import { SUPPORTED_LOCALES } from './locales';

afterEach(() => setCurrentLocale('en'));
it.each(SUPPORTED_LOCALES)('translates Composition docking actions in %s', async (locale) => {
  await setCurrentLocale(locale);
  for (const key of ['ScreenshotComposition.dock', 'ScreenshotComposition.undock']) {
    expect(i18n.global.te(key, locale)).toBe(true);
    expect(i18n.global.t(key)).not.toBe(key);
    expect(i18n.global.t(key)).not.toBe('');
  }
});
