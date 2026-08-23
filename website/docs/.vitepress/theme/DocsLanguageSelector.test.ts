import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

const pageState = vi.hoisted(() => ({ value: { relativePath: 'recorder/interface.md' } }));

vi.mock('vitepress', () => ({
  useData: () => ({ page: pageState }),
  withBase: (path: string) => `/docs${path}`,
}));

import { enabledDocsLocales, getDocsCatalogs } from '../content/docs-routes';
import DocsLanguageSelector from './DocsLanguageSelector.vue';

const mounted: VueWrapper[] = [];

const mountSelector = () => {
  const wrapper = mount(DocsLanguageSelector, { attachTo: document.body });
  mounted.push(wrapper);
  return wrapper;
};

const openLanguageMenu = async (wrapper: VueWrapper) => {
  await wrapper.get('button.docs-language-trigger').trigger('click');
  await nextTick();
  await nextTick();
  const menu = document.body.querySelector<HTMLElement>('[role="listbox"]');
  if (!menu) throw new Error('The docs language menu did not open.');
  return menu;
};

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
  pageState.value = { relativePath: 'recorder/interface.md' };
});

describe('DocsLanguageSelector', () => {
  it('uses the Languages icon for its trigger', () => {
    const wrapper = mountSelector();
    const icon = wrapper.get('button.docs-language-trigger svg');

    expect(icon.classes()).toContain('lucide-languages');
    expect(wrapper.find('.lucide-earth').exists()).toBe(false);
  });

  it('keeps the current documentation page while switching locale', async () => {
    pageState.value = { relativePath: 'fr/recorder/interface.md' };
    const wrapper = mountSelector();
    const menu = await openLanguageMenu(wrapper);
    const links = [...menu.querySelectorAll<HTMLAnchorElement>('a[role="option"]')];

    expect(links).toHaveLength(enabledDocsLocales.length);
    for (const locale of enabledDocsLocales) {
      const link = links.find((candidate) => candidate.getAttribute('lang') === getDocsCatalogs(locale).common.locale);
      expect(link, `missing ${locale} docs option`).toBeDefined();
      expect(link?.getAttribute('href')).toBe(`/docs/${locale === 'en' ? '' : `${locale}/`}recorder/interface`);
    }
    expect(links.find((link) => link.getAttribute('aria-selected') === 'true')?.getAttribute('lang')).toBe(
      getDocsCatalogs('fr').common.locale,
    );
  });

  it('keeps the docs home route when switching locale', async () => {
    pageState.value = { relativePath: 'index.md' };
    const wrapper = mountSelector();
    const menu = await openLanguageMenu(wrapper);
    const links = [...menu.querySelectorAll<HTMLAnchorElement>('a[role="option"]')];

    expect(
      links.find((link) => link.getAttribute('lang') === getDocsCatalogs('en').common.locale)?.getAttribute('href'),
    ).toBe('/docs/');
    expect(
      links.find((link) => link.getAttribute('lang') === getDocsCatalogs('fr').common.locale)?.getAttribute('href'),
    ).toBe('/docs/fr/');
  });
});
