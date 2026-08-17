import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createWebsiteI18n, type WebsiteLocale } from '../i18n';
import WebsiteFooter from './WebsiteFooter.vue';

const comparisonLinks = [
  ['Screen Studio', 'beam-vs-screen-studio'],
  ['Tella', 'beam-vs-tella'],
  ['OpenScreen', 'beam-vs-openscreen'],
  ['OBS Studio', 'beam-vs-obs'],
  ['Loom', 'beam-vs-loom'],
] as const;

const mountFooter = (locale: WebsiteLocale) =>
  mount(WebsiteFooter, {
    global: {
      plugins: [createWebsiteI18n(locale)],
    },
  });

describe('WebsiteFooter', () => {
  it('links every product comparison to its FAQ anchor', () => {
    const wrapper = mountFooter('en');
    const comparisonNav = wrapper.get('nav[aria-label="Compare Beam"]');
    const links = comparisonNav.findAll('a');

    expect(links).toHaveLength(comparisonLinks.length);
    comparisonLinks.forEach(([name, id], index) => {
      expect(links[index]?.text()).toBe(`Beam vs ${name}`);
      expect(links[index]?.attributes('href')).toBe(`/faq#${id}`);
    });
  });

  it.each([
    [
      'en',
      {
        footer: 'Open-source screen recorder and editor.',
        productAria: 'Beam links',
        productHeading: 'Product',
        compareNav: 'Compare Beam',
        communityNav: 'Beam community',
        download: 'Download Beam',
        report: 'Report an issue',
      },
    ],
    [
      'fr',
      {
        footer: 'Enregistreur d’écran et éditeur open source.',
        productAria: 'Liens Beam',
        productHeading: 'Produit',
        compareNav: 'Comparatifs Beam',
        communityNav: 'Communauté Beam',
        download: 'Télécharger Beam',
        report: 'Signaler un bug',
      },
    ],
  ] as const)('renders the %s footer copy and navigation labels', (locale, expected) => {
    const wrapper = mountFooter(locale);

    expect(wrapper.get('.site-footer__brand').text()).toContain(expected.footer);
    expect(wrapper.get(`nav[aria-label="${expected.productAria}"]`).text()).toContain(expected.productHeading);
    expect(wrapper.get(`nav[aria-label="${expected.productAria}"]`).text()).toContain(expected.download);
    expect(wrapper.get(`nav[aria-label="${expected.compareNav}"]`).text()).toContain('Beam vs Screen Studio');
    expect(wrapper.get(`nav[aria-label="${expected.communityNav}"]`).text()).toContain(expected.report);
  });

  it('keeps product documentation and FAQ links internal', () => {
    const wrapper = mountFooter('en');
    const productNav = wrapper.get('nav[aria-label="Beam links"]');

    productNav.get('a[href="/install"]');
    productNav.get('a[href="/docs/"]');
    productNav.get('a[href="/faq"]');
  });
});
