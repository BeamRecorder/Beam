import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EditorLoadingThrobber from '../EditorLoadingThrobber.vue';

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

describe('EditorLoadingThrobber', () => {
  beforeEach(() => setReducedMotion(false));

  it('exposes the complete loading message to assistive technology', () => {
    const wrapper = mount(EditorLoadingThrobber, { props: { text: 'Preparing editor' } });

    expect(wrapper.get('.editor-loading-throbber').attributes('role')).toBe('status');
    expect(wrapper.get('.editor-loading-throbber').attributes('aria-label')).toBe('Preparing editor');
    expect(wrapper.findAll('.editor-loading-glyph')).toHaveLength(16);
  });

  it('keeps spaces visible while the glyph wave is animated', () => {
    const wrapper = mount(EditorLoadingThrobber, { props: { text: 'A B' } });

    expect(wrapper.findAll('.editor-loading-glyph')[1].element.textContent).toBe('\u00a0');
  });

  it('updates the accessible and visual text when the locale changes', async () => {
    const wrapper = mount(EditorLoadingThrobber, { props: { text: 'Preparing' } });

    await wrapper.setProps({ text: 'Préparation' });

    expect(wrapper.get('.editor-loading-throbber').attributes('aria-label')).toBe('Préparation');
    expect(wrapper.findAll('.editor-loading-glyph')).toHaveLength(11);
  });

  it('renders a static, fully visible message when reduced motion is requested', () => {
    setReducedMotion(true);
    const wrapper = mount(EditorLoadingThrobber, { props: { text: 'Loading' } });

    expect(
      wrapper.findAll('.editor-loading-glyph').every((glyph) => glyph.attributes('style')?.includes('opacity: 1')),
    ).toBe(true);
  });
});
