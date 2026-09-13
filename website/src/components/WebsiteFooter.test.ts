import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createWebsiteI18n, loadWebsiteLocale, type WebsiteLocale } from '../i18n';
import WebsiteFooter from './WebsiteFooter.vue';

const comparisonLinks = [
  ['Screen Studio', 'beam-vs-screen-studio'],
  ['Tella', 'beam-vs-tella'],
  ['OpenScreen', 'beam-vs-openscreen'],
  ['OBS Studio', 'beam-vs-obs'],
  ['Loom', 'beam-vs-loom'],
] as const;

const mountFooter = async (locale: WebsiteLocale) => {
  const i18n = createWebsiteI18n(locale);
  await loadWebsiteLocale(i18n, locale);
  return mount(WebsiteFooter, {
    global: {
      plugins: [i18n],
    },
  });
};

describe('WebsiteFooter', () => {
  it('links every product comparison to its FAQ anchor', async () => {
    const wrapper = await mountFooter('en');
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
        footer: 'Free, open-source screen recorder and video editor.',
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
        footer: 'Enregistreur d’écran et éditeur vidéo gratuits et open source.',
        productAria: 'Liens Beam',
        productHeading: 'Produit',
        compareNav: 'Comparatifs Beam',
        communityNav: 'Communauté Beam',
        download: 'Télécharger Beam',
        report: 'Signaler un bug',
      },
    ],
  ] as const)('renders the %s footer copy and navigation labels', async (locale, expected) => {
    const wrapper = await mountFooter(locale);

    expect(wrapper.get('.site-footer__brand').text()).toContain(expected.footer);
    expect(wrapper.get(`nav[aria-label="${expected.productAria}"]`).text()).toContain(expected.productHeading);
    expect(wrapper.get(`nav[aria-label="${expected.productAria}"]`).text()).toContain(expected.download);
    expect(wrapper.get(`nav[aria-label="${expected.compareNav}"]`).text()).toContain('Beam vs Screen Studio');
    expect(wrapper.get(`nav[aria-label="${expected.communityNav}"]`).text()).toContain(expected.report);
  });

  it('keeps product documentation and FAQ links internal', async () => {
    const wrapper = await mountFooter('en');
    const productNav = wrapper.get('nav[aria-label="Beam links"]');

    productNav.get('a[href="/install"]');
    productNav.get('a[href="/docs/"]');
    productNav.get('a[href="/faq"]');
  });
});
