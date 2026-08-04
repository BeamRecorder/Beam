import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import Switch from './Switch.vue';

describe('Switch', () => {
  it('exposes checked state and label accessibly', () => {
    const wrapper = mount(Switch, { props: { modelValue: true, label: 'System audio' } });
    expect(wrapper.get('[role=switch]').attributes('aria-checked')).toBe('true');
    expect(wrapper.text()).toContain('System audio');
  });
  it('toggles enabled switches', async () => {
    const wrapper = mount(Switch, { props: { modelValue: false } });
    await wrapper.get('.switch-container').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
  });
  it('does not toggle a disabled switch', async () => {
    const wrapper = mount(Switch, { props: { modelValue: false, disabled: true } });
    await wrapper.get('.switch-container').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
