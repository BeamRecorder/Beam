import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
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
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));
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

  it('renders the GitHub stargazer count from the public repository response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stargazers_count: 1234 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    wrapper = mountActions();

    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('https://api.github.com/repos/BeamRecorder/Beam', {
      headers: { Accept: 'application/vnd.github+json' },
    });
    expect(wrapper.get('.github-link strong').text()).toBe('1.2K');
  });

  it('keeps the GitHub link usable when the stars request fails', async () => {
    wrapper = mountActions();

    await flushPromises();

    const githubLink = wrapper.get<HTMLAnchorElement>('.github-link');
    expect(githubLink.attributes('href')).toBe('https://github.com/BeamRecorder/Beam');
    expect(githubLink.attributes('target')).toBe('_blank');
    expect(githubLink.attributes('rel')).toBe('noreferrer');
    expect(githubLink.get('strong').text()).toBe('…');
  });

  it('renders website, GitHub, Discord, and theme-toggle actions', () => {
    wrapper = mountActions();

    expect(wrapper.get('.website-link').attributes('href')).toBe('https://beam.plinka.eu');
    expect(wrapper.get('.github-link').attributes('href')).toBe('https://github.com/BeamRecorder/Beam');
    expect(wrapper.get('.discord-link').attributes('href')).toBe('https://discord.gg/6Q6v2xUCB');
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
