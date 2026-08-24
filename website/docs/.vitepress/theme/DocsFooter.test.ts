import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

const pageState = vi.hoisted(() => ({ value: { relativePath: 'index.md' } }));

vi.mock('vitepress', () => ({
  useData: () => ({ page: pageState }),
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
  pageState.value = { relativePath: 'index.md' };
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
    pageState.value = { relativePath: 'fr/recorder/interface.md' };
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
