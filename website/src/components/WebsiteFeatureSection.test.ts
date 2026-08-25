import { mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebsiteFeature } from '@website/types/website-features';
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
      title: 'A powerful editor.',
      description: 'Built for speed and precision, from first cut to final export.',
      features,
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

    expect(title.text()).toBe('A powerful editor.');
    expect(title.findAll('.feature-section__punctuation').map((part) => part.text())).toEqual(['.']);
    expect(wrapper.get('.feature-section__intro p').text()).toBe(
      'Built for speed and precision, from first cut to final export.',
    );
    expect(cards.map((card) => card.get('h3').text())).toEqual(['3D zooms', 'Custom backgrounds', 'Export your way']);
    expect(cards.every((card) => card.classes().length === 1)).toBe(true);
    expect(images[0].attributes('srcset')).toContain('backgrounds-960.webp 960w');
    expect(images[0].attributes('loading')).toBe('lazy');
    expect(images[1].attributes('alt')).toBe('');
    expect(wrapper.find('.feature-card__backdrop').exists()).toBe(true);
    expect(wrapper.find('.feature-card__backdrop--video').exists()).toBe(true);
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
