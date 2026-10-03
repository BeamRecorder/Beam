import { afterEach, describe, expect, it } from 'vitest';
import { i18n, setCurrentLocale } from './index';
import { SUPPORTED_LOCALES } from './locales';

afterEach(() => setCurrentLocale('en'));
describe('shared glass zoom translations', () => {
  it.each(SUPPORTED_LOCALES)('provides all controls and screenshot layer names in %s', async (locale) => {
    await setCurrentLocale(locale);
    const english = i18n.global.getLocaleMessage('en')!.GlassHighlight;
    for (const key of Object.keys(english)) {
      const path = `GlassHighlight.${key}`;
      expect(i18n.global.te(path, locale), path).toBe(true);
      expect(i18n.global.t(path).trim(), path).not.toBe('');
      expect(i18n.global.t(path), path).not.toBe(path);
    }
    expect(i18n.global.te('ScreenshotComposition.zoom', locale)).toBe(true);
  });
});
