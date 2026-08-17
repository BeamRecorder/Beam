import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const withBase = vi.hoisted(() =>
  vi.fn((path: string) => (path.startsWith('/') ? `/docs${path}` : path)),
);

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

    expect(wrapper.get('a').attributes('href')).toBe('/docs/recorder/');
    expect(wrapper.get('.docs-product-card__backdrop').attributes('style')).toMatch(
      /background-image:\s*url\(["']?\/docs\/showcase\/amber-l\.jpg["']?\)/,
    );
    expect(wrapper.get('.docs-product-card__visual img').attributes('src')).toBe(
      '/docs/showcase/Beam-showcase-hud.png',
    );
    expect(withBase).toHaveBeenCalledWith('/recorder/');
    expect(withBase).toHaveBeenCalledWith('/showcase/amber-l.jpg');
    expect(withBase).toHaveBeenCalledWith('/showcase/Beam-showcase-hud.png');
  });

  it('does not rewrite external product links', () => {
    const link = 'https://github.com/ExtraBinoss/Beam';
    const wrapper = mountCard({ link });

    expect(wrapper.get('a').attributes('href')).toBe(link);
    expect(withBase).toHaveBeenCalledWith(link);
  });

  it.each([
    ['recorder', 'Recorder app', '/showcase/Beam-showcase-hud.png'],
    ['editor', 'Video editor', '/showcase/Beam-showcase-editor.png'],
  ] as const)('renders the %s product visual with its accessible label and base-aware image', (visual, title, imagePath) => {
    const wrapper = mountCard({ visual, title });
    const visualElement = wrapper.get('.docs-product-card__visual');

    expect(visualElement.classes()).toContain(`is-${visual}`);
    expect(visualElement.attributes('role')).toBe('img');
    expect(visualElement.attributes('aria-label')).toBe(`${title} interface in Beam`);
    expect(visualElement.get('img').attributes('src')).toBe(`/docs${imagePath}`);
    expect(withBase).toHaveBeenCalledWith(imagePath);
  });

  it('renders the product title, details, and explore action as card content', () => {
    const wrapper = mountCard({ title: 'Video editor', details: 'Shape timing, captions, and export.' });

    expect(wrapper.get('strong').text()).toBe('Video editor');
    expect(wrapper.text()).toContain('Shape timing, captions, and export.');
    expect(wrapper.get('.docs-product-card__action').text()).toContain('Explore Video editor');
    expect(wrapper.get('a').attributes('href')).toBe('/docs/recorder/');
  });
});
