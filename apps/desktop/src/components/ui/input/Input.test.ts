import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Input from './Input.vue';
enableAutoUnmount(afterEach);

describe('Input', () => {
  it('keeps a complete numeric draft across intermediate digits and commits it on Enter', async () => {
    const wrapper = mount(Input, { props: { modelValue: 50, type: 'number', min: 2, commitOnBlur: true } });
    const input = wrapper.get('input');
    for (const value of ['1', '10', '100']) await input.setValue(value);
    expect(input.element.value).toBe('100');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('update:modelValue')).toEqual([['100']]);
    await wrapper.setProps({ modelValue: 100 });
    expect(input.element.value).toBe('100');
    await input.trigger('blur');
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
  });
  it('commits an unfinished draft only once on blur, then restores the accepted value', async () => {
    const wrapper = mount(Input, { props: { modelValue: 50, type: 'number', commitOnBlur: true } });
    const input = wrapper.get('input');
    await input.setValue('');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await input.trigger('blur');
    expect(wrapper.emitted('update:modelValue')).toEqual([['']]);
    expect(input.element.value).toBe('50');
    await input.trigger('blur');
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
  });
  it('replaces a draft with authoritative undo or external state without committing the stale value', async () => {
    const wrapper = mount(Input, { props: { modelValue: 50, commitOnBlur: true } });
    const input = wrapper.get('input');
    await input.setValue('75');
    await wrapper.setProps({ modelValue: 25 });
    expect(input.element.value).toBe('25');
    await input.trigger('blur');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
  it('keeps drag preview immediate, starting from the current draft, without replaying it on blur', async () => {
    vi.useFakeTimers();
    const wrapper = mount(Input, { props: { modelValue: 50, type: 'number', commitOnBlur: true } });
    const input = wrapper.get('input');
    await input.setValue('100');
    await input.trigger('mousedown', { button: 0, clientX: 0 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 8 }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    expect(wrapper.emitted('update:modelValue')).toEqual([[102]]);
    await wrapper.setProps({ modelValue: 102 });
    await input.trigger('blur');
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(50);
  });

  it('emits immediately for a non-positive debounce and makes disposed focus methods harmless', async () => {
    const wrapper = mount(Input, { props: { modelValue: '', debounce: -10 } });
    await wrapper.get('input').setValue('edited');
    expect(wrapper.emitted('update:modelValue')).toEqual([['edited']]);
    const { focus, select } = wrapper.vm;
    wrapper.unmount();
    expect(() => {
      focus();
      select();
    }).not.toThrow();
  });
  it('starts a numeric drag from an unfinished empty value without producing NaN', async () => {
    vi.useFakeTimers();
    const wrapper = mount(Input, { props: { modelValue: '', type: 'number' } });
    await wrapper.get('input').trigger('mousedown', { button: 0, clientX: 0 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 8 }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    expect(wrapper.emitted('update:modelValue')).toEqual([[2]]);
    await vi.advanceTimersByTimeAsync(50);
  });
  it('supports exposed focus, selection and flush methods without changing the value', async () => {
    const wrapper = mount(Input, { attachTo: document.body, props: { modelValue: 'draft', selectOnFocus: true } });
    wrapper.vm.focus();
    expect(document.activeElement).toBe(wrapper.get('input').element);
    expect(wrapper.get('input').element.selectionStart).toBe(0);
    expect(wrapper.get('input').element.selectionEnd).toBe(5);
    wrapper.vm.select();
    wrapper.vm.flush();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
  it('focuses and selects an autofocus field again after mounting settles', async () => {
    vi.useFakeTimers();
    const wrapper = mount(Input, { attachTo: document.body, props: { modelValue: 'initial', autofocus: true } });
    expect(document.activeElement).toBe(wrapper.get('input').element);
    await vi.advanceTimersByTimeAsync(60);
    expect(wrapper.get('input').element.selectionEnd).toBe(7);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
  it('replaces pending debounced text, ignores unrelated keys and flushes once on Enter', async () => {
    vi.useFakeTimers();
    const wrapper = mount(Input, { props: { modelValue: '', debounce: 100 } });
    const input = wrapper.get('input');
    await input.setValue('first');
    await input.setValue('latest');
    await input.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await input.trigger('keydown', { key: 'Enter' });
    await vi.advanceTimersByTimeAsync(100);
    expect(wrapper.emitted('update:modelValue')).toEqual([['latest']]);
    await input.trigger('blur');
    expect(wrapper.emitted('blur')).toHaveLength(1);
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
  });
  it('retains zero as a pending debounced numeric string', async () => {
    vi.useFakeTimers();
    const wrapper = mount(Input, { props: { modelValue: 3, type: 'number', debounce: 100 } });
    await wrapper.get('input').setValue('0');
    wrapper.vm.flush();
    expect(wrapper.emitted('update:modelValue')).toEqual([['0']]);
    await vi.advanceTimersByTimeAsync(100);
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
  });
  it('does not start a drag from text, a disabled number or a secondary mouse button', async () => {
    for (const props of [
      { modelValue: 0, type: 'text' },
      { modelValue: 0, type: 'number', disabled: true },
      { modelValue: 0, type: 'number' },
    ]) {
      const wrapper = mount(Input, { props: { ...props, disabled: props.disabled ?? false } });
      await wrapper
        .get('input')
        .trigger('mousedown', { button: props.type === 'number' && !props.disabled ? 2 : 0, clientX: 0 });
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 40 }));
      window.dispatchEvent(new MouseEvent('mouseup'));
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
      wrapper.unmount();
    }
  });
  it('keeps short pointer movement as a click and supports an unbounded fractional Shift drag', async () => {
    const wrapper = mount(Input, { props: { modelValue: 1.5, type: 'number', step: 0.1 } });
    const input = wrapper.get('input');
    await input.trigger('mousedown', { button: 0, clientX: 0 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 4 }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await input.trigger('mousedown', { button: 0, clientX: 0 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 8, shiftKey: true }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    expect(wrapper.emitted('update:modelValue')).toEqual([[3.5]]);
  });
  it('bounds negative drags and consumes only the click immediately following a drag', async () => {
    vi.useFakeTimers();
    const wrapper = mount(Input, { props: { modelValue: 1, type: 'number', min: 0 } });
    await wrapper.get('input').trigger('mousedown', { button: 0, clientX: 0 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: -20 }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    expect(wrapper.emitted('update:modelValue')).toEqual([[0]]);
    const click = new MouseEvent('click', { cancelable: true });
    window.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    await vi.advanceTimersByTimeAsync(50);
    const next = new MouseEvent('click', { cancelable: true });
    window.dispatchEvent(next);
    expect(next.defaultPrevented).toBe(false);
  });

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

it('offers unit selection only when enabled and commits the old-unit draft before switching', async () => {
  const wrapper = mount(Input, {
    props: {
      modelValue: 100,
      type: 'number',
      commitOnBlur: true,
      unit: 'px',
      unitOptions: [
        { value: 'px', label: 'px' },
        { value: '%', label: '%' },
      ],
      unitLabel: 'Width unit',
    },
    global: { stubs: { teleport: true } },
  });
  const changes: string[] = [];
  wrapper.vm.$.emit = (
    (original) =>
    (event: string, ...args: unknown[]) => {
      changes.push(event);
      original(event, ...args);
    }
  )(wrapper.vm.$.emit);
  await wrapper.get('input').setValue('200');
  await wrapper.get('.unit-trigger').trigger('click');
  expect(wrapper.emitted('update:modelValue')).toEqual([['200']]);
  await wrapper.get('[aria-checked="false"]').trigger('click');
  expect(wrapper.emitted('update:unit')).toEqual([['%']]);
  expect(changes.indexOf('update:modelValue')).toBeLessThan(changes.indexOf('update:unit'));
  await wrapper.setProps({ unit: '%', modelValue: 10 });
  expect(wrapper.get('input').element.value).toBe('10');
  await wrapper.get('input').trigger('blur');
  expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
  await wrapper.setProps({ unitOptions: [] });
  expect(wrapper.find('.unit-trigger').exists()).toBe(false);
  expect(wrapper.text()).toBe('%');
});
it('uses the field label for an optional unit menu and reflects unit-only changes without a stale draft', async () => {
  const wrapper = mount(Input, {
    props: {
      modelValue: 10,
      commitOnBlur: true,
      unit: 'px',
      unitOptions: [
        { value: 'px', label: 'px' },
        { value: '%', label: '%' },
      ],
    },
    attrs: { 'aria-label': 'Width' },
    global: { stubs: { teleport: true } },
  });
  expect(wrapper.get('.unit-trigger').attributes('aria-label')).toBe('Width');
  await wrapper.get('input').setValue('stale');
  await wrapper.setProps({ unit: '%' });
  await wrapper.get('input').trigger('blur');
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  expect(wrapper.get('input').element.value).toBe('10');
});
