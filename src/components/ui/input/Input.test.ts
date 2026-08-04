import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import Input from './Input.vue';

describe('Input', () => {
  it('renders slots, constraints and string updates', async () => {
    const wrapper = mount(Input, {
      props: { modelValue: 'old', id: 'title', placeholder: 'Name', error: 'Required' },
      slots: { prefix: 'P', suffix: 'S' },
    });
    const input = wrapper.get('input');
    expect(input.attributes('id')).toBe('title');
    expect(wrapper.text()).toContain('Required');
    expect(wrapper.text()).toContain('PS');
    await input.setValue('new');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['new']);
  });
  it('supports bounded number drag interaction and cleans up', async () => {
    const wrapper = mount(Input, { props: { modelValue: 2, type: 'number', min: 0, max: 5, step: 1 } });
    await wrapper.get('input').trigger('mousedown', { button: 0, clientX: 0 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 40 }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([5]);
    expect(document.body.classList.contains('is-dragging-input')).toBe(false);
  });
  it('does not start numeric drag when disabled, text, or non-primary click', async () => {
    for (const props of [
      { modelValue: 1, disabled: true },
      { modelValue: 'x', type: 'text' },
      { modelValue: 1, type: 'number' },
    ]) {
      const wrapper = mount(Input, { props: props as never });
      await wrapper.get('input').trigger('mousedown', { button: props.type === 'number' ? 2 : 0, clientX: 0 });
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 30 }));
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    }
  });
});
