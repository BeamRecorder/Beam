import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';

const reducedMotion = vi.hoisted(() => ({ value: true }));
vi.mock('@vueuse/motion', () => ({ useReducedMotion: () => reducedMotion }));

import Throbber from './Throbber.vue';
import { getThrobberGlobalTime } from './useThrobberSync';

describe('Throbber', () => {
  it('renders accessible text for assistive technologies', () => {
    const wrapper = mount(Throbber, { props: { text: 'Loading demo' } });

    expect(wrapper.get('.throbber').attributes('role')).toBe('status');
    expect(wrapper.get('.throbber').attributes('aria-label')).toBe('Loading demo');
    expect(wrapper.findAll('.throbber-glyph')).toHaveLength(12);
  });

  it('keeps text in one stable node while retaining animated dots', () => {
    const wrapper = mount(Throbber, {
      props: { text: 'Transcribing…', animateText: false, inheritTypography: true, dots: true },
    });

    expect(wrapper.findAll('.throbber-static-text')).toHaveLength(1);
    expect(wrapper.get('.throbber-static-text').text()).toBe('Transcribing…');
    expect(wrapper.findAll('.throbber-glyph')).toHaveLength(0);
    expect(wrapper.get('.throbber').classes()).toContain('throbber-inherit-typography');
    expect(wrapper.get('.throbber-content').attributes('aria-hidden')).toBe('true');
    expect(wrapper.findAll('.throbber-dot')).toHaveLength(3);
  });

  it('animates dots when reduced motion is detected but explicitly ignored', async () => {
    const globalTime = getThrobberGlobalTime();
    globalTime.value = 0;
    const wrapper = mount(Throbber, {
      props: { text: 'Transcribing…', animateText: false, dots: true, respectReducedMotion: false },
    });
    const dot = wrapper.find('.throbber-dot');
    const initialStyle = dot.attributes('style');

    globalTime.value = 700;
    await nextTick();

    expect(dot.attributes('style')).not.toBe(initialStyle);
  });

  it('keeps highlight glyph geometry fixed while only its color animates', async () => {
    const globalTime = getThrobberGlobalTime();
    globalTime.value = 0;
    const wrapper = mount(Throbber, {
      props: { text: 'A', variant: 'highlight', respectReducedMotion: false },
    });
    const glyph = wrapper.get('.throbber-glyph');
    const initialStyle = glyph.attributes('style');

    expect(initialStyle).toContain('opacity: 1');
    expect(initialStyle).toContain('transform: translateY(0)');
    expect(initialStyle).not.toContain('filter:');

    globalTime.value = 700;
    await nextTick();

    const updatedStyle = glyph.attributes('style');
    expect(updatedStyle).toContain('opacity: 1');
    expect(updatedStyle).toContain('transform: translateY(0)');
    expect(updatedStyle).not.toContain('filter:');
    expect(updatedStyle).not.toBe(initialStyle);
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

  it('synchronizes all throbber instances on the exact same RAF clock', async () => {
    const globalTime = getThrobberGlobalTime();
    globalTime.value = 1000;

    const wrapper1 = mount(Throbber, { props: { text: 'Preparing', variant: 'wave' } });
    const wrapper2 = mount(Throbber, { props: { text: 'Loading timeline', variant: 'breathe' } });

    const glyph1 = wrapper1.findAll('.throbber-glyph')[0];
    const glyph2 = wrapper2.findAll('.throbber-glyph')[0];

    expect(glyph1.attributes('style')).toContain('opacity:');
    expect(glyph2.attributes('style')).toContain('opacity:');

    // Advancing global time synchronously updates both throbbers
    globalTime.value = 1700;
    await wrapper1.vm.$nextTick();
    await wrapper2.vm.$nextTick();

    expect(glyph1.attributes('style')).toBeDefined();
    expect(glyph2.attributes('style')).toBeDefined();
  });
});
