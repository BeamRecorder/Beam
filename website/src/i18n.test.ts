import { describe, expect, it } from 'vitest';
import { WEBSITE_LOCALES, normalizeWebsiteLocale, websiteI18n, type WebsiteLocale } from './i18n';

const EXPECTED_LOCALES = [
  'en',
  'fr',
  'es',
  'de',
  'ru',
  'bg',
  'zh-CN',
  'ko',
  'pt-BR',
  'ja',
  'it',
  'pl',
  'zh-TW',
  'hi',
  'vi',
] as const satisfies readonly WebsiteLocale[];

type MessageRecord = Record<string, unknown>;

const isMessageRecord = (value: unknown): value is MessageRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const websiteMessage = (locale: WebsiteLocale): MessageRecord => {
  const message = websiteI18n.global.getLocaleMessage(locale) as MessageRecord;
  const website = message.Website;
  if (!isMessageRecord(website)) throw new Error(`Missing Website messages for ${locale}`);
  return website;
};

const leafPaths = (value: unknown, prefix = ''): string[] => {
  if (!isMessageRecord(value)) return [prefix];
  return Object.entries(value)
    .flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key))
    .sort();
};

const leafValues = (value: unknown, prefix = ''): Array<{ path: string; value: unknown }> => {
  if (!isMessageRecord(value)) return [{ path: prefix, value }];
  return Object.entries(value).flatMap(([key, child]) => leafValues(child, prefix ? `${prefix}.${key}` : key));
};

describe('website i18n', () => {
  it('registers exactly the fifteen supported locales', () => {
    expect(WEBSITE_LOCALES).toEqual(EXPECTED_LOCALES);
    expect([...websiteI18n.global.availableLocales].sort()).toEqual([...EXPECTED_LOCALES].sort());
  });

  it('keeps the Website namespace recursively identical to English', () => {
    const englishKeys = leafPaths(websiteMessage('en'));

    for (const locale of EXPECTED_LOCALES) {
      expect(leafPaths(websiteMessage(locale)), `${locale} Website keys`).toEqual(englishKeys);
    }
  });

  it('keeps every Website translation value non-empty', () => {
    for (const locale of EXPECTED_LOCALES) {
      const values = leafValues(websiteMessage(locale));
      expect(values.length, `${locale} Website values`).toBeGreaterThan(0);
      for (const { path, value } of values) {
        expect(typeof value, `${locale}.${path} value type`).toBe('string');
        expect((value as string).trim(), `${locale}.${path}`).not.toBe('');
      }
    }
  });

  it.each([
    ['zh-HK', 'zh-TW'],
    ['zh-CN', 'zh-CN'],
    ['pt-BR', 'pt-BR'],
    ['unsupported', null],
  ] as const)('normalizes %s to %s', (language, expected) => {
    expect(normalizeWebsiteLocale(language)).toBe(expected);
  });
});
