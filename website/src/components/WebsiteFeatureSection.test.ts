import { mount, type VueWrapper } from '@vue/test-utils';
import { Crop, ScanLine } from '@lucide/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebsiteFeature, WebsiteFeatureGroups } from '@website/types/website-features';
import type { WebsiteModeOption } from '@website/types/website-modes';
import WebsiteFeatureSection from './WebsiteFeatureSection.vue';

const features: WebsiteFeature[] = [
  {
    title: '3D zooms',
    media: {
      type: 'video',
      src: '/features/tilt-zoom-full.webm',
      poster: '/features/tilt-zoom-full-poster.webp',
      width: 1280,
      height: 720,
    },
  },
  {
    title: 'Custom backgrounds',
    media: {
      type: 'image',
      src: '/features/backgrounds-640.webp',
      srcset: '/features/backgrounds-640.webp 640w, /features/backgrounds-960.webp 960w',
      sizes: '390px',
      width: 640,
      height: 640,
    },
  },
  {
    title: 'Export your way',
    media: {
      type: 'image',
      src: '/features/export-settings-640.webp',
      srcset: '/features/export-settings-640.webp 640w, /features/export-settings-960.webp 960w',
      sizes: '640px',
      width: 640,
      height: 640,
      fit: 'contain',
    },
  },
];

const modes: WebsiteModeOption[] = [
  { id: 'instant', label: 'Instant Mode', icon: ScanLine },
  { id: 'studio', label: 'Studio Mode', icon: ScanLine },
  { id: 'screenshot', label: 'Screenshot Mode', icon: ScanLine },
];

const groups: WebsiteFeatureGroups = {
  instant: {
    title: ['Record.', 'Stop.', 'Paste.'],
    description: 'Instant description.',
    features: features.slice(1),
  },
  studio: {
    title: ['Edit.', 'Refine.', 'Export.'],
    description: 'Studio description.',
    features,
  },
  screenshot: {
    title: ['Capture.', 'Explain.', 'Copy.'],
    description: 'Screenshot description.',
    features: [{ title: 'Crop and resize', media: { type: 'placeholder', label: 'Crop media', icon: Crop } }],
  },
};

let intersectionCallback: IntersectionObserverCallback;
const observe = vi.fn();
const disconnect = vi.fn();

class IntersectionObserverMock implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '320px 0px';
  readonly scrollMargin = '0px';
  readonly thresholds = [0];

  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
  }

  observe = observe;
  disconnect = disconnect;
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);
}

const mountSection = (): VueWrapper =>
  mount(WebsiteFeatureSection, {
    props: {
      eyebrow: 'Explore features',
      modeNavigation: 'Feature modes',
      modes,
      groups,
    },
  });

beforeEach(() => {
  observe.mockClear();
  disconnect.mockClear();
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
});

describe('WebsiteFeatureSection', () => {
  it('renders concise feature labels and responsive product images', () => {
    const wrapper = mountSection();
    const cards = wrapper.findAll('.feature-card');
    const images = wrapper.findAll('img');

    const title = wrapper.get('h2');

    expect(title.text().replaceAll(/\s+/g, ' ')).toBe('Edit. Refine. Export.');
    expect(title.findAll('.mode-message__phrase').map((part) => part.text())).toEqual(['Edit.', 'Refine.', 'Export.']);
    expect(wrapper.get('.mode-message__description').text()).toBe('Studio description.');
    expect(cards.map((card) => card.get('h3').text())).toEqual(['3D zooms', 'Custom backgrounds', 'Export your way']);
    expect(cards.every((card) => card.classes().length === 1)).toBe(true);
    expect(images[0].attributes('srcset')).toContain('backgrounds-960.webp 960w');
    expect(images[0].attributes('loading')).toBe('lazy');
    expect(images[1].attributes('alt')).toBe('');
    expect(wrapper.find('.feature-card__backdrop').exists()).toBe(true);
    expect(wrapper.find('.feature-card__backdrop--video').exists()).toBe(true);
  });

  it('switches the copy and media group through the shared mode controls', async () => {
    const wrapper = mountSection();

    await wrapper.findAll('.feature-section__modes button')[2]!.trigger('click');

    expect(wrapper.get('h2').text().replaceAll(/\s+/g, ' ')).toBe('Capture. Explain. Copy.');
    expect(wrapper.findAll('.feature-card')).toHaveLength(1);
    expect(wrapper.get('.feature-card h3').text()).toBe('Crop and resize');
    expect(wrapper.get('.feature-card__placeholder').attributes('aria-label')).toBe('Crop media');
  });

  it('waits until the section is near the viewport before loading video files', async () => {
    const wrapper = mountSection();
    const video = wrapper.get('video');

    expect(observe).toHaveBeenCalledWith(wrapper.element);
    expect(video.attributes('src')).toBeUndefined();

    intersectionCallback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    await wrapper.vm.$nextTick();
    expect(video.attributes('src')).toBeUndefined();

    intersectionCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    await wrapper.vm.$nextTick();
    expect(video.attributes('src')).toBe('/features/tilt-zoom-full.webm');
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('keeps video on its static poster when reduced motion is requested', () => {
    vi.mocked(window.matchMedia).mockReturnValueOnce({ matches: true } as MediaQueryList);
    const wrapper = mountSection();

    expect(observe).not.toHaveBeenCalled();
    expect(wrapper.get('video').attributes('src')).toBeUndefined();
    expect(wrapper.get('video').attributes('poster')).toBe('/features/tilt-zoom-full-poster.webp');
  });

  it('disconnects its media observer when unmounted before intersection', () => {
    const wrapper = mountSection();
    wrapper.unmount();

    expect(disconnect).toHaveBeenCalledOnce();
  });
});
