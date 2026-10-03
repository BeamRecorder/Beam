import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AdvancedButton from './AdvancedButton.vue';

describe('AdvancedButton', () => {
  it('renders a closed accessible control with the shared properties icon', () => {
    const wrapper = mount(AdvancedButton, {
      props: { controls: 'advanced-panel', label: 'Advanced' },
    });
    const button = wrapper.get('button');

    expect(button.attributes('aria-expanded')).toBe('false');
    expect(button.attributes('aria-controls')).toBe('advanced-panel');
    expect(button.text()).toBe('Advanced');
    expect(button.find('.lucide-sliders-horizontal').exists()).toBe(true);
  });

  it('requests the opposite state without owning its consumer panel', async () => {
    const wrapper = mount(AdvancedButton, {
      props: { open: true, controls: 'advanced-panel', label: 'Avancé' },
    });

    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true');
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('update:open')).toEqual([[false]]);
  });
});
