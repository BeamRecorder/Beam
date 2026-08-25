import { createHead } from '@unhead/vue/client';
import { mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
        Button: passthrough('button'),
      },
    },
  });

describe('HomePage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('presents the concise English hero and product feature grid', () => {
    const wrapper = mountHome();
    const hero = wrapper.get('.website-hero');
    const features = wrapper.get('#editor-demo');

    expect(wrapper.get('#hero-title').text()).toBe('Record. Edit. Share.');
    expect(
      wrapper
        .get('#hero-title')
        .findAll('.hero-title__punctuation')
        .map((part) => part.text()),
    ).toEqual(['.', '.', '.']);
    expect(hero.get('.hero-availability').text()).toContain('Free on every desktop.');
    expect(hero.get('.hero-availability').text()).toContain('Available for Windows, macOS, and Linux.');
    expect(hero.find('.hero-eyebrow').exists()).toBe(false);
    expect(wrapper.find('.availability').exists()).toBe(false);
    expect(wrapper.text()).toContain(
      'Beam makes polished screen recordings, so your product demos are easier to create—and better to watch.',
    );
    expect(wrapper.text()).toContain('free');
    expect(wrapper.text()).toContain('Windows');
    expect(wrapper.text()).toContain('macOS');
    expect(wrapper.text()).toContain('Linux');
    expect(wrapper.find('[data-testid="hud-preview"]').exists()).toBe(false);
    expect(wrapper.find('#capture').exists()).toBe(false);
    expect(wrapper.find('[data-testid="editor-preview"]').exists()).toBe(false);
    expect(wrapper.find('.hero-drag').exists()).toBe(false);
    expect(wrapper.find('.hero-drag__cursor').exists()).toBe(false);
    expect(wrapper.find('[data-testid="project-loader"]').exists()).toBe(false);
    expect(features.get('h2').text()).toBe('A powerful editor.');
    expect(features.get('.feature-section__intro p').text()).toBe(
      'Built for speed and precision, from first cut to final export.',
    );
    const featureCards = features.findAll('.feature-card');

    expect(featureCards).toHaveLength(6);
    expect(features.findAll('h3').map((title) => title.text())).toEqual([
      'Recorder app',
      'Video editor',
      'Custom backgrounds',
      'Precise zoom controls',
      '3D zooms',
      'Export your way',
    ]);
    expect(features.findAll('video')).toHaveLength(1);
    expect(features.findAll('img')).toHaveLength(5);

    const mobileImageCandidates = new Map([
      ['Video editor', '/features/editor-400.webp'],
      ['Custom backgrounds', '/features/backgrounds-400.webp'],
      ['Precise zoom controls', '/features/zooms-400.webp'],
      ['Export your way', '/features/export-settings-400.webp'],
    ]);

    for (const [title, src] of mobileImageCandidates) {
      const card = featureCards.find((candidate) => candidate.get('h3').text() === title);

      expect(card, `Missing feature card: ${title}`).toBeDefined();
      expect(card?.find('picture source').attributes()).toMatchObject({
        media: '(max-width: 760px)',
        srcset: src,
      });
    }

    expect(features.findAll('.feature-card__media--product')).toHaveLength(2);
    expect(features.get('.feature-card__media--product .feature-card__backdrop').attributes('style')).toContain(
      'product-backdrop.webp',
    );
    expect(wrapper.find('.showcase-image').exists()).toBe(false);
  });

  it('does not render the removed hero explore action', () => {
    const wrapper = mountHome();
    expect(wrapper.find('.hero-drag__explore').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('See Beam in action');
    expect(wrapper.text()).not.toContain('Explore the editor');
  });

  it('keeps the community shader and primary actions in the open-source section', () => {
    const wrapper = mountHome();
    const community = wrapper.find('.open-source');

    expect(community.exists()).toBe(true);
    expect(community.classes()).toContain('shader-panel');
    expect(community.find('canvas.community-shader').exists()).toBe(true);
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('webgl', expect.anything());
    expect(community.text()).toContain('Built in the open.');
    expect(community.text()).toContain('View on GitHub');
    expect(community.text()).toContain('Join Discord');
    expect(wrapper.text()).toContain('Download Beam — Free');
    expect(wrapper.find('a[href="https://github.com/BeamRecorder/Beam"]').exists()).toBe(true);
    expect(wrapper.get('.contributors img').attributes('src')).toBe('/beam-contributors.svg');
  });
});
