import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  page: { value: { relativePath: 'index.md' } },
  theme: {
    value: {
      nav: [{ text: 'Beam website', link: 'https://beam.plinka.eu' }],
      sidebar: [
        {
          text: 'Documentation',
          items: [
            { text: 'Getting started', link: '/getting-started' },
            { text: 'Recorder', link: '/recorder/' },
            { text: 'Video editor', link: '/editor/' },
            { text: 'Export', link: '/export' },
            { text: 'Platforms', link: '/platforms' },
          ],
        },
      ],
      footer: { message: 'Beam documentation', copyright: 'Beam' },
    },
  },
}));

vi.mock('vitepress', () => ({
  useData: () => ({ page: state.page, theme: state.theme }),
  withBase: (path: string) => `/docs${path}`,
}));

import DocsFooter from './DocsFooter.vue';

const mounted: VueWrapper[] = [];

const mountFooter = () => {
  const wrapper = mount(DocsFooter);
  mounted.push(wrapper);
  return wrapper;
};

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  state.page.value = { relativePath: 'index.md' };
  for (const item of state.theme.value.sidebar[0].items) item.link = item.link.replace(/^\/fr/, '');
});

describe('DocsFooter', () => {
  it('links to the official website, community, and important documentation pages', () => {
    const wrapper = mountFooter();
    const hrefs = wrapper.findAll('a').map((link) => link.attributes('href'));

    expect(hrefs).toEqual(
      expect.arrayContaining([
        'https://beam.plinka.eu',
        'https://beam.plinka.eu/install',
        'https://github.com/BeamRecorder/Beam',
        'https://discord.gg/6Q6v2xUCB',
        '/docs/getting-started',
        '/docs/recorder/',
        '/docs/editor/',
        '/docs/export',
        '/docs/platforms',
      ]),
    );
  });

  it('keeps important documentation links in the current locale', () => {
    state.page.value = { relativePath: 'fr/recorder/interface.md' };
    for (const item of state.theme.value.sidebar[0].items) item.link = `/fr${item.link}`;
    const wrapper = mountFooter();
    const hrefs = wrapper.findAll('a').map((link) => link.attributes('href'));

    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/docs/fr/getting-started',
        '/docs/fr/recorder/',
        '/docs/fr/editor/',
        '/docs/fr/export',
        '/docs/fr/platforms',
      ]),
    );
  });
});
