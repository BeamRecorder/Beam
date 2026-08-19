import { createHead } from '@unhead/vue/client';
import { mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebsiteI18n } from '../i18n';
import HomePage from './HomePage.vue';

vi.mock('../composables/useGitHubRepository', () => ({
  useGitHubRepository: () => ({
    contributorCount: ref(12),
    load: vi.fn(),
  }),
}));

const passthrough = (tag: string) =>
  defineComponent({
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () => h(tag, attrs, slots.default?.());
    },
  });

const mountHome = () =>
  mount(HomePage, {
    global: {
      plugins: [createWebsiteI18n('en'), createHead()],
      stubs: {
        ClientOnly: defineComponent({
          setup(_, { slots }) {
            return () => slots.default?.();
          },
        }),
        Button: passthrough('button'),
        WebsiteEditorPreview: defineComponent({
          inheritAttrs: false,
          setup(_, { attrs }) {
            return () => h('div', { ...attrs, 'data-testid': 'editor-preview' }, 'Editor preview');
          },
        }),
        WebsiteHudPreview: defineComponent({
          setup() {
            return () => h('div', { 'data-testid': 'hud-preview' }, 'HUD preview');
          },
        }),
        WebsiteCommunityShader: defineComponent({
          setup() {
            return () => h('canvas', { 'data-testid': 'community-shader', 'aria-hidden': 'true' });
          },
        }),
      },
    },
  });

describe('HomePage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('presents the concise English hero and editor-only product story', () => {
    const wrapper = mountHome();

    expect(wrapper.get('#hero-title').text()).toBe('Record. Edit. Share.');
    expect(wrapper.text()).toContain(
      'Beam makes polished screen recordings, so your product demos are easier to create—and better to watch.',
    );
    expect(wrapper.text()).toContain('free');
    expect(wrapper.text()).toContain('Windows');
    expect(wrapper.text()).toContain('macOS');
    expect(wrapper.text()).toContain('Linux');
    expect(wrapper.find('[data-testid="hud-preview"]').exists()).toBe(false);
    expect(wrapper.find('#capture').exists()).toBe(false);
    expect(wrapper.find('[data-testid="editor-preview"]').exists()).toBe(true);
  });

  it('keeps the community shader and primary actions in the open-source section', () => {
    const wrapper = mountHome();
    const community = wrapper.find('.open-source');

    expect(community.exists()).toBe(true);
    expect(community.find('[data-testid="community-shader"]').exists()).toBe(true);
    expect(community.text()).toContain('Built in the open.');
    expect(community.text()).toContain('View on GitHub');
    expect(community.text()).toContain('Join Discord');
    expect(wrapper.text()).toContain('Download Beam — Free');
    expect(wrapper.find('a[href="https://github.com/BeamRecorder/Beam"]').exists()).toBe(true);
  });
});
