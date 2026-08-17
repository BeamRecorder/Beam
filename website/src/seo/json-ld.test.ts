import type { Question } from 'schema-dts';
import { describe, expect, it } from 'vitest';
import { WEBSITE_LOCALES } from '../i18n';
import { faqItems, getFaqCatalog, localizedFaqItems } from './faq-content';
import { createFaqJsonLd, createHomeJsonLd } from './json-ld';

describe('website JSON-LD', () => {
  it('describes the website and software on the homepage', () => {
    const schemas = createHomeJsonLd();
    expect(schemas.map((schema) => schema['@type'])).toEqual(['WebSite', 'SoftwareApplication']);
    expect(schemas.every((schema) => schema['@context'] === 'https://schema.org')).toBe(true);
  });

  it('uses only absolute production URLs for software links', () => {
    const software = createHomeJsonLd()[1];
    expect(software).toMatchObject({
      url: 'https://beam.plinka.eu',
      image: 'https://beam.plinka.eu/Beam-showcase.png',
      downloadUrl: 'https://github.com/ExtraBinoss/Beam/releases/latest',
    });
  });

  it('creates one schema question for every visible FAQ item', () => {
    const schema = createFaqJsonLd();
    const questions = schema.mainEntity as Question[];
    expect(questions).toHaveLength(faqItems.length);
    expect(questions.map((item) => item.name)).toEqual(faqItems.map((item) => item.question));
  });

  it('keeps FAQ answers identical to visible copy', () => {
    const schema = createFaqJsonLd();
    const questions = schema.mainEntity as Question[];
    expect(questions.map((item) => item.acceptedAnswer)).toEqual(
      faqItems.map((item) => ({ '@type': 'Answer', text: item.answer })),
    );
  });

  it.each(['en', 'fr'] as const)('keeps the %s localized FAQ catalogue aligned with JSON-LD', (locale) => {
    const items = localizedFaqItems(locale);
    const questions = (createFaqJsonLd(items).mainEntity ?? []) as Question[];

    expect(questions.map((item) => item.name)).toEqual(items.map((item) => item.question));
    expect(questions.map((item) => item.acceptedAnswer)).toEqual(
      items.map((item) => ({ '@type': 'Answer', text: item.answer })),
    );
  });

  it('provides a complete translated FAQ catalogue for every website locale', () => {
    const english = getFaqCatalog('en');

    for (const locale of WEBSITE_LOCALES) {
      const catalog = getFaqCatalog(locale);
      expect(catalog.meta.title.trim(), `${locale} FAQ title`).not.toBe('');
      expect(catalog.meta.description.trim(), `${locale} FAQ description`).not.toBe('');
      expect(catalog.items, `${locale} FAQ items`).toHaveLength(english.items.length);
      expect(
        catalog.items.map((item) => item.id),
        `${locale} FAQ ids`,
      ).toEqual(english.items.map((item) => item.id));
      expect(
        catalog.items.every((item) => item.question.trim() && item.answer.trim()),
        `${locale} FAQ copy`,
      ).toBe(true);
      for (const item of catalog.items) {
        if (item.sourceUrl) expect(item.sourceLabel?.trim(), `${locale} ${item.id} source label`).not.toBe('');
      }
      if (locale !== 'en') {
        expect(catalog, `${locale} must not fall back to English`).not.toBe(english);
        expect(catalog.items.some((item, index) => item.question !== english.items[index]?.question)).toBe(true);
      }
    }
  });
});
