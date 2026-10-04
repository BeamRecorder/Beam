import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ThemeChoicePreview from './ThemeChoicePreview.vue';
import { SURFACE_TONES } from '~/types/appearance';

describe('theme choice previews', () => {
  it.each(['light', 'dark'] as const)('uses the real neutral %s surface palette', (mode) => {
    const wrapper = mount(ThemeChoicePreview, { props: { mode } });
    expect(wrapper.findAll('.preview-skin')).toHaveLength(1);
    const preview = wrapper.get('.preview-skin').element as HTMLElement;
    const expected = document.createElement('span');
    expected.style.background = SURFACE_TONES.neutral[mode].bgApp;
    expect(preview.style.background).toBe(expected.style.background);
    expect(wrapper.attributes('aria-hidden')).toBe('true');
    expect(wrapper.find('button').exists()).toBe(false);
    wrapper.unmount();
  });
  it('shows both palettes for System and responds when the mode changes', async () => {
    const wrapper = mount(ThemeChoicePreview, { props: { mode: 'system' } });
    expect(wrapper.findAll('.preview-skin')).toHaveLength(2);
    expect(wrapper.classes()).toContain('split');
    expect(wrapper.find('.split-right').exists()).toBe(true);
    await wrapper.setProps({ mode: 'dark' });
    expect(wrapper.findAll('.preview-skin')).toHaveLength(1);
    expect(wrapper.classes()).not.toContain('split');
    wrapper.unmount();
  });
});
