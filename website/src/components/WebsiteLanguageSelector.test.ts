import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { createWebsiteI18n, detectWebsiteLocale, WEBSITE_LOCALES, type WebsiteLocale } from '../i18n';
import WebsiteLanguageSelector from './WebsiteLanguageSelector.vue';

const mounted: VueWrapper[] = [];

const mountSelector = (locale: WebsiteLocale = 'en') => {
  const i18n = createWebsiteI18n(locale);
  const wrapper = mount(WebsiteLanguageSelector, {
    attachTo: document.body,
    global: { plugins: [i18n] },
  });
  mounted.push(wrapper);
  return { wrapper, i18n };
};

const openLanguageMenu = async (wrapper: VueWrapper) => {
  await wrapper.get('button.language-trigger').trigger('click');
  await nextTick();
  await nextTick();
  const menu = document.body.querySelector<HTMLElement>('[role="listbox"]');
  if (!menu) throw new Error('The website language menu did not open.');
  return menu;
};

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
  document.documentElement.lang = '';
  window.localStorage.clear();
});

describe('WebsiteLanguageSelector', () => {
  it('uses the Languages icon for the language trigger', () => {
    const { wrapper } = mountSelector();
    const trigger = wrapper.get('button.language-trigger');
    const icon = trigger.get('svg');

    expect(trigger.classes()).toContain('btn-ghost');
    expect(icon.classes()).toContain('lucide-languages');
    expect(wrapper.find('.lucide-earth').exists()).toBe(false);
  });

  it('lists every supported website locale and marks the active locale', async () => {
    const { wrapper } = mountSelector('fr');
    const menu = await openLanguageMenu(wrapper);
    const options = [...menu.querySelectorAll<HTMLElement>('[role="option"]')];

    expect(options).toHaveLength(WEBSITE_LOCALES.length);
    expect(options.map((option) => option.getAttribute('aria-selected'))).toContain('true');
    expect(options.find((option) => option.textContent?.includes('Français'))?.getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('changes the i18n locale, document language, and persisted preference', async () => {
    const { wrapper, i18n } = mountSelector('en');
    const menu = await openLanguageMenu(wrapper);
    const french = [...menu.querySelectorAll<HTMLButtonElement>('button')].find((option) =>
      option.textContent?.includes('Français'),
    );

    expect(french).toBeDefined();
    french?.click();
    await nextTick();

    expect(i18n.global.locale.value).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
    expect(window.localStorage.getItem('locale')).toBe('fr');
    expect(detectWebsiteLocale()).toBe('fr');
  });
});
