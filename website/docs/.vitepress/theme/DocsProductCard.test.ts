import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const withBase = vi.hoisted(() => vi.fn((path: string) => (path.startsWith('/') ? `/docs${path}` : path)));

vi.mock('vitepress', () => ({ withBase }));

import DocsProductCard from './DocsProductCard.vue';

type CardProps = {
  title: string;
  details: string;
  link: string;
  visual: 'recorder' | 'editor';
};

const defaultProps: CardProps = {
  title: 'Recorder app',
  details: 'Choose a source and start a focused capture.',
  link: '/recorder/',
  visual: 'recorder',
};

describe('DocsProductCard', () => {
  const wrappers: VueWrapper[] = [];

  const mountCard = (overrides: Partial<CardProps> = {}) => {
    const wrapper = mount(DocsProductCard, { props: { ...defaultProps, ...overrides } });
    wrappers.push(wrapper);
    return wrapper;
  };

  beforeEach(() => {
    withBase.mockClear();
    withBase.mockImplementation((path: string) => (path.startsWith('/') ? `/docs${path}` : path));
  });

  afterEach(() => {
    for (const wrapper of wrappers) wrapper.unmount();
    wrappers.length = 0;
  });

  it('resolves the card link, background, and recorder visual against the docs base path', () => {
    const wrapper = mountCard();
    const image = wrapper.get('.docs-product-card__visual img');

    expect(wrapper.get('a').attributes('href')).toBe('/docs/recorder/');
    expect(wrapper.get('.docs-product-card__backdrop').attributes('style')).toMatch(
      /background-image:\s*url\(["']?\/docs\/showcase\/amber-800\.webp["']?\)/,
    );
    expect(image.attributes('src')).toBe('/docs/showcase/Beam-showcase-hud-160.webp');
    expect(image.attributes('srcset')).toBe(
      '/docs/showcase/Beam-showcase-hud-160.webp 160w, /docs/showcase/Beam-showcase-hud-280.webp 280w, /docs/showcase/Beam-showcase-hud-320.webp 320w',
    );
    expect(image.attributes('sizes')).toBe('160px');
    expect(image.attributes('width')).toBe('160');
    expect(image.attributes('height')).toBe('240');
    expect(withBase).toHaveBeenCalledWith('/recorder/');
    expect(withBase).toHaveBeenCalledWith('/showcase/amber-800.webp');
    expect(withBase).toHaveBeenCalledWith('/showcase/Beam-showcase-hud-160.webp');
    expect(withBase).toHaveBeenCalledWith('/showcase/Beam-showcase-hud-280.webp');
    expect(withBase).toHaveBeenCalledWith('/showcase/Beam-showcase-hud-320.webp');
  });

  it('does not rewrite external product links', () => {
    const link = 'https://github.com/BeamRecorder/Beam';
    const wrapper = mountCard({ link });

    expect(wrapper.get('a').attributes('href')).toBe(link);
    expect(withBase).toHaveBeenCalledWith(link);
  });

  it.each([
    [
      'recorder',
      'Recorder app',
      '/showcase/Beam-showcase-hud-160.webp',
      '/showcase/Beam-showcase-hud-160.webp 160w, /showcase/Beam-showcase-hud-280.webp 280w, /showcase/Beam-showcase-hud-320.webp 320w',
      '160px',
      '160',
      '240',
    ],
    [
      'editor',
      'Video editor',
      '/showcase/Beam-showcase-editor-400.webp',
      '/showcase/Beam-showcase-editor-400.webp 400w, /showcase/Beam-showcase-editor-600.webp 600w, /showcase/Beam-showcase-editor-800.webp 800w',
      '(max-width: 720px) calc(90vw - 44px), 326px',
      '400',
      '250',
    ],
  ] as const)(
    'renders the %s product visual with its accessible label and base-aware image',
    (visual, title, imagePath, srcset, sizes, width, height) => {
      const wrapper = mountCard({ visual, title });
      const visualElement = wrapper.get('.docs-product-card__visual');
      const image = visualElement.get('img');

      expect(visualElement.classes()).toContain(`is-${visual}`);
      expect(visualElement.attributes('role')).toBe('img');
      expect(visualElement.attributes('aria-label')).toBe(`${title} interface in Beam`);
      expect(image.attributes('src')).toBe(`/docs${imagePath}`);
      expect(image.attributes('srcset')).toBe(srcset.replaceAll('/showcase/', '/docs/showcase/'));
      expect(image.attributes('sizes')).toBe(sizes);
      expect(image.attributes('width')).toBe(width);
      expect(image.attributes('height')).toBe(height);
      expect(image.attributes('loading')).toBe('lazy');
      expect(image.attributes('decoding')).toBe('async');
      expect(image.attributes('fetchpriority')).toBe('low');
      expect(withBase).toHaveBeenCalledWith(imagePath);
    },
  );

  it('renders the product title, details, and explore action as card content', () => {
    const wrapper = mountCard({ title: 'Video editor', details: 'Shape timing, captions, and export.' });

    expect(wrapper.get('strong').text()).toBe('Video editor');
    expect(wrapper.text()).toContain('Shape timing, captions, and export.');
    expect(wrapper.get('.docs-product-card__action').text()).toContain('Explore Video editor');
    expect(wrapper.get('a').attributes('href')).toBe('/docs/recorder/');
  });
});
