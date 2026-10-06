import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import Switch from './Switch.vue';

describe('Switch', () => {
  it('exposes checked state and label accessibly', () => {
    const wrapper = mount(Switch, {
      props: { modelValue: true, label: 'System audio' },
    });
    expect(wrapper.get('[role=switch]').attributes('aria-checked')).toBe('true');
    expect(wrapper.text()).toContain('System audio');
  });
  it('supports an accessible name without rendering a visible label', () => {
    const wrapper = mount(Switch, {
      props: { modelValue: false, ariaLabel: 'Blur' },
    });
    expect(wrapper.get('[role=switch]').attributes('aria-label')).toBe('Blur');
    expect(wrapper.text()).toBe('');
  });
  it('toggles enabled switches', async () => {
    const wrapper = mount(Switch, { props: { modelValue: false } });
    await wrapper.get('.switch-container').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
  });
  it('does not toggle a disabled switch', async () => {
    const wrapper = mount(Switch, {
      props: { modelValue: false, disabled: true },
    });
    await wrapper.get('.switch-container').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
  it.each([false, true])(
    'preserves checked=%s while unavailable, and becomes interactive when enabled',
    async (checked) => {
      const wrapper = mount(Switch, { props: { modelValue: checked, disabled: true } });
      const button = wrapper.get('[role="switch"]');
      expect(button.attributes('aria-checked')).toBe(String(checked));
      expect(button.attributes('disabled')).toBeDefined();
      expect(wrapper.classes()).toContain('is-disabled');
      await wrapper.get('.switch-container').trigger('click');
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
      await wrapper.setProps({ disabled: false });
      expect(button.attributes('disabled')).toBeUndefined();
      expect(wrapper.classes()).not.toContain('is-disabled');
      await button.trigger('click');
      expect(wrapper.emitted('update:modelValue')).toEqual([[!checked]]);
      wrapper.unmount();
    },
  );
});
