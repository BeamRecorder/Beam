import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./DocsLanguageSelector.vue', () => ({
  default: {
    template: '<button class="docs-language-selector" type="button">Language</button>',
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
        DocsLanguageSelector: true,
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

  it('delegates the custom search button to the VitePress search button', async () => {
    const searchButton = document.querySelector<HTMLButtonElement>('.DocSearch-Button');
    const click = vi.spyOn(searchButton!, 'click');
    wrapper = mountActions();

    await wrapper.get('.docs-search-trigger').trigger('click');

    expect(click).toHaveBeenCalledOnce();
  });

  it('renders the GitHub stargazer count from the public repository response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stargazers_count: 1234 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    wrapper = mountActions();

    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('https://api.github.com/repos/ExtraBinoss/Beam', {
      headers: { Accept: 'application/vnd.github+json' },
    });
    expect(wrapper.get('.github-link strong').text()).toBe('1.2K');
  });

  it('keeps the GitHub link usable when the stars request fails', async () => {
    wrapper = mountActions();

    await flushPromises();

    const githubLink = wrapper.get<HTMLAnchorElement>('.github-link');
    expect(githubLink.attributes('href')).toBe('https://github.com/ExtraBinoss/Beam');
    expect(githubLink.attributes('target')).toBe('_blank');
    expect(githubLink.attributes('rel')).toBe('noreferrer');
    expect(githubLink.get('strong').text()).toBe('…');
  });

  it('renders website, GitHub, Discord, and theme-toggle actions', () => {
    wrapper = mountActions();

    expect(wrapper.get('.website-link').attributes('href')).toBe('https://beam.plinka.eu');
    expect(wrapper.get('.github-link').attributes('href')).toBe('https://github.com/ExtraBinoss/Beam');
    expect(wrapper.get('.discord-link').attributes('href')).toBe('https://discord.gg/6Q6v2xUCB');
    expect(wrapper.find('.docs-theme-toggle').exists()).toBe(true);
  });
});
