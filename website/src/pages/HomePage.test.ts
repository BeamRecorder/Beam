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

    expect(wrapper.get('#hero-title').text().replaceAll(/\s+/g, ' ')).toBe('Record. Shape. Make it yours.');
    expect(
      wrapper
        .get('#hero-title')
        .findAll('.mode-message__phrase')
        .map((part) => part.text()),
    ).toEqual(['Record.', 'Shape.', 'Make it yours.']);
    expect(hero.get('.hero-availability').text()).toContain('Free, local-first, and open source.');
    expect(hero.get('.hero-availability').text()).toContain('Available for Windows, macOS, and Linux.');
    expect(hero.find('.hero-eyebrow').exists()).toBe(false);
    expect(wrapper.find('.availability').exists()).toBe(false);
    expect(wrapper.text()).toContain('Keep the screen, camera, sound, timing, and motion editable.');
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
    expect(wrapper.findAll('.mode-card')).toHaveLength(3);
    expect(wrapper.findAll('.mode-spotlight')).toHaveLength(3);
    expect(wrapper.findAll('.mode-spotlight__badge')).toHaveLength(3);
    expect(wrapper.findAll('.mode-spotlight__badge svg')).toHaveLength(3);
    expect(wrapper.text()).not.toContain('Three capture modes');
    expect(wrapper.text()).not.toContain('Editable project');
    expect(wrapper.text()).not.toContain('Real Beam editor footage');
    expect(wrapper.get('#instant').text()).toContain('The video file is copied');
    expect(wrapper.get('#screenshot').text()).toContain('Direct cropping');
    expect(features.get('.feature-section__title').text()).toBe('Explore features.');
    expect(features.get('h3').text().replaceAll(/\s+/g, ' ')).toBe('Edit. Refine. Export.');
    expect(features.get('.mode-message__description').text()).toContain('Keep every source editable');
    const featureCards = features.findAll('.feature-card');

    expect(featureCards).toHaveLength(3);
    expect(features.findAll('.feature-card h4').map((title) => title.text())).toEqual([
      'Video editor',
      'Precise zoom controls',
      '3D zooms',
    ]);
    expect(features.findAll('video')).toHaveLength(1);
    expect(features.findAll('img')).toHaveLength(2);

    const mobileImageCandidates = new Map([
      ['Video editor', '/features/editor-400.webp'],
      ['Precise zoom controls', '/features/zooms-400.webp'],
    ]);

    for (const [title, src] of mobileImageCandidates) {
      const card = featureCards.find((candidate) => candidate.get('h4').text() === title);

      expect(card, `Missing feature card: ${title}`).toBeDefined();
      expect(card?.find('picture source').attributes()).toMatchObject({
        media: '(max-width: 760px)',
        srcset: src,
      });
    }

    expect(features.findAll('.feature-card__media--product')).toHaveLength(1);
    expect(features.get('.feature-card__media--product .feature-card__backdrop').attributes('style')).toContain(
      'product-backdrop.webp',
    );
    expect(wrapper.find('.showcase-image').exists()).toBe(false);
  });

  it('keeps the hero and feature explorer mode selections synchronized', async () => {
    const wrapper = mountHome();
    const hero = wrapper.get('.website-hero');
    const features = wrapper.get('#editor-demo');

    await hero.findAll('.hero-modes button')[0]!.trigger('click');

    expect(features.findAll('.feature-section__modes button')[0]!.attributes('aria-pressed')).toBe('true');
    expect(features.get('h3').text().replaceAll(/\s+/g, ' ')).toBe('Record. Stop. Paste.');
    expect(features.findAll('.feature-card h4').map((title) => title.text())).toEqual([
      'Recorder app',
      'Custom backgrounds',
      'Export your way',
    ]);

    await features.findAll('.feature-section__modes button')[2]!.trigger('click');

    expect(hero.findAll('.hero-modes button')[2]!.attributes('aria-pressed')).toBe('true');
    expect(hero.get('#hero-title').text().replaceAll(/\s+/g, ' ')).toBe('Capture. Mark up. Make it clear.');
    expect(features.findAll('.feature-card__placeholder')).toHaveLength(3);
  });

  it('opens the synchronized Screenshot feature explorer from the hero announcement', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const wrapper = mountHome();
    document.body.appendChild(wrapper.element);

    await wrapper.get('.hero-announcement').trigger('click');
    await wrapper.vm.$nextTick();

    const features = wrapper.get('#editor-demo');
    expect(window.location.hash).toBe('#editor-demo');
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(features.findAll('.feature-section__modes button')[2]!.attributes('aria-pressed')).toBe('true');
    expect(features.get('h3').text().replaceAll(/\s+/g, ' ')).toBe('Capture. Explain. Copy.');
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
