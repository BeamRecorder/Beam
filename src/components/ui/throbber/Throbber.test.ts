import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Throbber from './Throbber.vue';

const setReducedMotion = (matches: boolean) => {
  window.matchMedia = vi.fn(
    () =>
      ({
        matches,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
};

describe('Throbber', () => {
  beforeEach(() => setReducedMotion(false));

  it('renders accessible text for assistive technologies', () => {
    const wrapper = mount(Throbber, { props: { text: 'Loading demo' } });

    expect(wrapper.get('.throbber').attributes('role')).toBe('status');
    expect(wrapper.get('.throbber').attributes('aria-label')).toBe('Loading demo');
    expect(wrapper.findAll('.throbber-glyph')).toHaveLength(12);
  });

  it('handles spaces correctly with non-breaking space glyphs', () => {
    const wrapper = mount(Throbber, { props: { text: 'A B' } });
    expect(wrapper.findAll('.throbber-glyph')[1].element.textContent).toBe('\u00a0');
  });

  it('supports animation variants wave, breathe, ripple, glow, bounce', () => {
    const variants = ['wave', 'breathe', 'ripple', 'glow', 'bounce'] as const;
    for (const variant of variants) {
      const wrapper = mount(Throbber, { props: { text: 'Test', variant } });
      expect(wrapper.get('.throbber').classes()).toContain(`throbber-variant-${variant}`);
    }
  });

  it('supports color variants primary, default, muted, gradient, white', () => {
    const colors = ['primary', 'default', 'muted', 'gradient', 'white'] as const;
    for (const color of colors) {
      const wrapper = mount(Throbber, { props: { text: 'Test', color } });
      expect(wrapper.get('.throbber').classes()).toContain(`throbber-color-${color}`);
    }
  });

  it('supports size variants xs, sm, md, lg, xl', () => {
    const sizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
    for (const size of sizes) {
      const wrapper = mount(Throbber, { props: { text: 'Test', size } });
      expect(wrapper.get('.throbber').classes()).toContain(`throbber-size-${size}`);
    }
  });

  it('renders animated trailing dots when dots prop is true', () => {
    const wrapper = mount(Throbber, { props: { text: 'Saving', dots: true } });
    expect(wrapper.find('.throbber-dots').exists()).toBe(true);
    expect(wrapper.findAll('.throbber-dot')).toHaveLength(3);
  });

  it('handles prefers-reduced-motion gracefully by disabling keyframes', () => {
    setReducedMotion(true);
    const wrapper = mount(Throbber, { props: { text: 'Loading' } });

    expect(
      wrapper.findAll('.throbber-glyph').every((glyph) => glyph.attributes('style')?.includes('opacity: 1')),
    ).toBe(true);
  });
});
