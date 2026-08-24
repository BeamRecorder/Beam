import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./DocsLanguageSelector.vue', () => ({
  default: {
    template: '<button class="docs-language-trigger" type="button"><svg class="lucide-languages" /></button>',
  },
}));

vi.mock('./DocsSearch.vue', () => ({
  default: {
    template: '<button class="docs-search-trigger" type="button">Search</button>',
  },
}));

import DocsNavActions from './DocsNavActions.vue';

const ClientOnlyStub = {
  template: '<span class="client-only"><slot /></span>',
};

const DocsThemeToggleStub = {
  template: '<button class="docs-theme-toggle" type="button">Toggle theme</button>',
};

const mountActions = () =>
  mount(DocsNavActions, {
    attachTo: document.body,
    global: {
      stubs: {
        ClientOnly: ClientOnlyStub,
        DocsThemeToggle: DocsThemeToggleStub,
      },
    },
  });

describe('DocsNavActions', () => {
  let wrapper: VueWrapper | undefined;

  beforeEach(() => {
    document.body.innerHTML =
      '<div class="VPNavBarSearch"><button class="DocSearch-Button" type="button"></button></div>';
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders the custom documentation search trigger', () => {
    wrapper = mountActions();

    expect(wrapper.get('.docs-search-trigger').text()).toBe('Search');
  });

  it('renders website, GitHub, Discord, and theme-toggle actions', () => {
    wrapper = mountActions();

    expect(wrapper.get('.website-link').attributes('href')).toBe('https://beam.plinka.eu');
    expect(wrapper.get('.github-link').attributes('href')).toBe('https://github.com/BeamRecorder/Beam');
    expect(wrapper.get('.discord-link').attributes('href')).toBe('https://discord.gg/6Q6v2xUCB');
    expect(wrapper.get('.website-link').text()).toContain('Beam website');
    expect(wrapper.get('.github-link').text()).toBe('');
    expect(wrapper.get('.github-link').attributes('aria-label')).toBe('GitHub');
    expect(wrapper.get('.discord-link').text()).toBe('');
    expect(wrapper.get('.discord-link').attributes('aria-label')).toBe('Discord');
    expect(wrapper.get('.actions-divider').element.nextElementSibling).toBe(wrapper.get('.github-link').element);
    expect(wrapper.find('.docs-language-trigger').exists()).toBe(true);
    expect(wrapper.find('.docs-language-trigger .lucide-languages').exists()).toBe(true);
    expect(wrapper.find('.docs-theme-toggle').exists()).toBe(true);
  });

  it('keeps the language menu available outside the mobile-removable theme control', () => {
    wrapper = mountActions();

    const languageTrigger = wrapper.get('.docs-language-trigger');
    const themeControl = wrapper.get('.docs-theme-control');

    expect(themeControl.find('.docs-theme-toggle').exists()).toBe(true);
    expect(themeControl.find('.docs-language-trigger').exists()).toBe(false);
    expect(languageTrigger.element.closest('.docs-theme-control')).toBeNull();
    expect(wrapper.find('.docs-search-trigger').exists()).toBe(true);
  });
});
