import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
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

import DocsMobileMenu from './DocsMobileMenu.vue';

const mounted: VueWrapper[] = [];

const mountMenu = () => {
  const wrapper = mount(DocsMobileMenu, { attachTo: document.body });
  mounted.push(wrapper);
  return wrapper;
};

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  state.page.value = { relativePath: 'index.md' };
  for (const item of state.theme.value.sidebar[0].items) item.link = item.link.replace(/^\/fr/, '');
  document.body.innerHTML = '';
});

describe('DocsMobileMenu', () => {
  it('opens a navigation popover with documentation and Beam links', async () => {
    const wrapper = mountMenu();
    const trigger = wrapper.get('.docs-mobile-menu-trigger');

    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('.tooltip').exists()).toBe(false);
    await trigger.trigger('click');
    await flushPromises();

    expect(trigger.attributes('aria-expanded')).toBe('true');
    const links = [...document.body.querySelectorAll<HTMLAnchorElement>('.docs-mobile-menu a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      expect.arrayContaining([
        '/docs/getting-started',
        '/docs/recorder/',
        '/docs/editor/',
        '/docs/export',
        '/docs/platforms',
        'https://beam.plinka.eu',
        'https://github.com/BeamRecorder/Beam',
        'https://discord.gg/6Q6v2xUCB',
      ]),
    );
  });

  it('keeps documentation links in the active locale', async () => {
    state.page.value = { relativePath: 'fr/recorder/interface.md' };
    for (const item of state.theme.value.sidebar[0].items) item.link = `/fr${item.link}`;
    const wrapper = mountMenu();

    await wrapper.get('.docs-mobile-menu-trigger').trigger('click');
    await flushPromises();

    const links = [...document.body.querySelectorAll<HTMLAnchorElement>('.docs-mobile-menu a')];
    expect(links.map((link) => link.getAttribute('href'))).toContain('/docs/fr/recorder/');
  });
});
