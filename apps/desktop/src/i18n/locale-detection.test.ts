import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectLocale } from './locale-detection';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('initial locale detection', () => {
  it('uses a supported saved preference before browser languages', () => {
    localStorage.setItem('locale', 'fr');
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE']);
    expect(detectLocale()).toBe('fr');
  });
  it.each([
    ['zh-HK', 'zh-TW'],
    ['zh-TW', 'zh-TW'],
    ['zh-CN', 'zh-CN'],
    ['pt-BR', 'pt-BR'],
    ['fr-CA', 'fr'],
    ['DE-de', 'de'],
  ])('normalizes %s into %s', (language, locale) => {
    localStorage.setItem('locale', 'unsupported');
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['unsupported', language]);
    expect(detectLocale()).toBe(locale);
  });
  it('uses the browser language when the language list is empty', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue([]);
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('ja-JP');
    expect(detectLocale()).toBe('ja');
  });
  it('uses English if no language is supported', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['xx']);
    expect(detectLocale()).toBe('en');
  });
  it('stays usable when preference storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(detectLocale()).toBe('en');
  });
});
