import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

const pageState = vi.hoisted(() => ({ value: { relativePath: 'index.md' } }));

vi.mock('vitepress', () => ({
  useData: () => ({ page: pageState }),
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
  pageState.value = { relativePath: 'index.md' };
  document.body.innerHTML = '';
});

describe('DocsMobileMenu', () => {
  it('opens a navigation popover with documentation and Beam links', async () => {
    const wrapper = mountMenu();
    const trigger = wrapper.get('.docs-mobile-menu-trigger');

    expect(trigger.attributes('aria-expanded')).toBe('false');
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
    pageState.value = { relativePath: 'fr/recorder/interface.md' };
    const wrapper = mountMenu();

    await wrapper.get('.docs-mobile-menu-trigger').trigger('click');
    await flushPromises();

    const links = [...document.body.querySelectorAll<HTMLAnchorElement>('.docs-mobile-menu a')];
    expect(links.map((link) => link.getAttribute('href'))).toContain('/docs/fr/recorder/');
  });
});
