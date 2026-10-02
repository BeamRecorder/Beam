import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Input from './Input.vue';

describe('Input', () => {
  it.each([0, 25.5, 100])('keeps the compact numeric field at its requested width for %s', async (value) => {
    const wrapper = mount(Input, {
      props: {
        modelValue: value,
        type: 'number',
        size: 'xs',
        width: '72px',
        min: 0,
        max: 100,
        step: 0.5,
      },
      attrs: { 'aria-label': 'Opacity' },
    });
    expect(wrapper.get('.input-wrapper').classes()).toContain('input-xs');
    expect(wrapper.get('.input-wrapper').attributes('style')).toContain('width: 72px');
    expect(wrapper.get('input').attributes('aria-label')).toBe('Opacity');
    await wrapper.get('input').setValue('50');
    expect(wrapper.emitted('update:modelValue')).toContainEqual(['50']);
    wrapper.unmount();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
  it('renders slots, constraints and string updates', async () => {
    const wrapper = mount(Input, {
      props: {
        modelValue: 'old',
        id: 'title',
        placeholder: 'Name',
        error: 'Required',
      },
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
    const wrapper = mount(Input, {
      props: { modelValue: 2, type: 'number', min: 0, max: 5, step: 1 },
    });
    await wrapper.get('input').trigger('mousedown', { button: 0, clientX: 0 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 40 }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([5]);
    expect(document.body.classList.contains('is-dragging-input')).toBe(false);
  });
  it('debounces text updates when debounce prop is provided and flushes on blur', async () => {
    vi.useFakeTimers();
    const wrapper = mount(Input, {
      props: { modelValue: 'initial', debounce: 150 },
    });
    const input = wrapper.get('input');
    await input.setValue('typing');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();

    vi.advanceTimersByTime(100);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();

    vi.advanceTimersByTime(55);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['typing']);

    // Test flush on blur
    await input.setValue('blurred text');
    expect(wrapper.emitted('update:modelValue')?.length).toBe(1);

    await input.trigger('blur');
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual(['blurred text']);
    vi.useRealTimers();
  });
});
