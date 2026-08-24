import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebsiteI18n } from '../i18n';

const githubState = vi.hoisted(() => ({
  stars: { value: 42 },
  load: vi.fn(),
}));

vi.mock('@website/composables/useGitHubRepository', () => ({
  useGitHubRepository: () => githubState,
}));

import WebsiteTopbar from './WebsiteTopbar.vue';

const ClientOnlyStub = {
  template: '<span class="client-only"><slot /><slot name="placeholder" /></span>',
};

const WebsiteLanguageSelectorStub = {
  template: '<button class="language-trigger" type="button">Language</button>',
};

const WebsiteThemeSelectorStub = {
  template: '<button class="theme-toggle" type="button">Theme</button>',
};

const WebsitePlatformIconStub = {
  props: ['platform'],
  template: '<span class="platform-icon" :data-platform="platform" />',
};

const mounted: VueWrapper[] = [];

const mountTopbar = () => {
  const wrapper = mount(WebsiteTopbar, {
    global: {
      plugins: [createWebsiteI18n('en')],
      stubs: {
        ClientOnly: ClientOnlyStub,
        WebsiteLanguageSelector: WebsiteLanguageSelectorStub,
        WebsiteThemeSelector: WebsiteThemeSelectorStub,
        WebsitePlatformIcon: WebsitePlatformIconStub,
      },
    },
  });
  mounted.push(wrapper);
  return wrapper;
};

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('WebsiteTopbar', () => {
  it('keeps the language selector outside the mobile-removable theme control', () => {
    const wrapper = mountTopbar();
    const languageTrigger = wrapper.get('.language-trigger');
    const themeControl = wrapper.get('.header-theme-control');

    expect(themeControl.find('.theme-toggle').exists()).toBe(true);
    expect(themeControl.find('.language-trigger').exists()).toBe(false);
    expect(languageTrigger.element.closest('.header-theme-control')).toBeNull();
  });

  it('keeps the main navigation and install control available', () => {
    const wrapper = mountTopbar();

    expect(wrapper.find('nav.site-nav a[href="/docs/"]').exists()).toBe(true);
    expect(wrapper.find('nav.site-nav a[href="/faq"]').exists()).toBe(true);

    const installButton = wrapper.get<HTMLAnchorElement>('.install-button');
    expect(installButton.text()).toContain('Install');
    expect(installButton.attributes('href')).toMatch(/^\/install(?:\?os=(?:windows|macos|linux))?$/);
  });
});
