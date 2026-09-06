import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BigSlider from './BigSlider.vue';

const Input = {
  inheritAttrs: false,
  props: ['modelValue'],
  emits: ['update:modelValue', 'keydown', 'blur'],
  template:
    '<input :id="$attrs.id" :type="$attrs.type" :min="$attrs.min" :max="$attrs.max" :step="$attrs.step" :class="$attrs.class" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @keydown="$emit(\'keydown\', $event)" @blur="$emit(\'blur\', $event)" />',
};

describe('BigSlider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('updates the range and reports interaction boundaries', async () => {
    const wrapper = mount(BigSlider, {
      props: {
        modelValue: 50,
        min: 0,
        max: 100,
        label: 'Opacity',
        defaultValue: 25,
        formatValue: (value: number) => `${value}%`,
      },
      global: { stubs: { Input } },
    });
    expect(wrapper.get('.big-slider-value').text()).toBe('50%');
    await wrapper.get('.big-slider-input').setValue('80');
    expect(wrapper.emitted('update:modelValue')).toContainEqual([80]);
    await wrapper.get('.big-slider-input').trigger('pointerdown');
    await wrapper.get('.big-slider-input').trigger('change');
    expect(wrapper.emitted('interaction-start')).toHaveLength(1);
    expect(wrapper.emitted('interaction-end')).toHaveLength(1);
  });

  it('scales the static fill from the minimum through the midpoint to the maximum', async () => {
    const wrapper = mount(BigSlider, {
      props: { modelValue: 0, min: 0, max: 100, label: 'Opacity' },
      global: { stubs: { Input } },
    });
    const fill = () => wrapper.get('.big-slider-fill');

    expect(fill().attributes('style')).toContain('scale3d(0, 1, 1)');
    await wrapper.setProps({ modelValue: 50 });
    expect(fill().attributes('style')).toContain('scale3d(0.5, 1, 1)');
    await wrapper.setProps({ modelValue: 100 });
    expect(fill().attributes('style')).toContain('scale3d(1, 1, 1)');

    await wrapper.get('.big-slider-value').trigger('click');
    const editingFill = wrapper.find('.big-slider-fill');
    expect(!editingFill.exists() || !editingFill.isVisible()).toBe(true);
    await wrapper.get('.slider-inline-input').trigger('keydown.esc');
    expect(wrapper.get('.big-slider-fill').isVisible()).toBe(true);
  });

  it('edits, clamps and resets a changed value', async () => {
    const wrapper = mount(BigSlider, {
      props: { modelValue: 50, min: 0, max: 100, label: 'Opacity', defaultValue: 25 },
      global: { stubs: { Input } },
    });
    await wrapper.get('.big-slider-value').trigger('click');
    expect(wrapper.find('.slider-inline-input').exists()).toBe(true);
    await wrapper.get('.slider-inline-input').setValue('150');
    await wrapper.get('.slider-inline-input').trigger('keydown.enter');
    expect(wrapper.emitted('update:modelValue')).toContainEqual([100]);
    expect(wrapper.find('.slider-reset-btn').exists()).toBe(true);
    const reset = wrapper.get('.slider-reset-btn');
    await reset.trigger('pointerdown');
    await reset.trigger('mousedown');
    await reset.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toContainEqual([25]);
    expect(wrapper.emitted('reset')).toHaveLength(1);
  });

  it('focuses and selects the direct editor, then closes it on escape', async () => {
    const wrapper = mount(BigSlider, {
      attachTo: document.body,
      props: { modelValue: 50, min: 0, max: 100, label: 'Opacity' },
      global: { stubs: { Input } },
    });

    const value = wrapper.get('.big-slider-value');
    await value.trigger('pointerdown');
    await value.trigger('mousedown');
    await value.trigger('click');
    await nextTick();
    expect(document.activeElement).toBe(wrapper.get('.slider-inline-input').element);

    await wrapper.get('.slider-inline-input').trigger('keydown.esc');
    expect(wrapper.find('.slider-inline-input').exists()).toBe(false);
    wrapper.unmount();
  });

  it('falls back to the current value for invalid direct input and ends interaction on unmount', async () => {
    const wrapper = mount(BigSlider, {
      props: { modelValue: 12, min: 0, max: 20, label: 'Value' },
      global: { stubs: { Input } },
    });
    await wrapper.get('.big-slider-value').trigger('click');
    await wrapper.get('.slider-inline-input').setValue('invalid');
    await wrapper.get('.slider-inline-input').trigger('blur');
    expect(wrapper.emitted('update:modelValue')).toContainEqual([12]);
    await wrapper.get('.big-slider-input').trigger('pointerdown');
    wrapper.unmount();
    expect(wrapper.emitted('interaction-end')).toHaveLength(1);
  });

  it('coalesces drag updates to one composition update per animation frame', async () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const wrapper = mount(BigSlider, {
      props: { modelValue: 0, min: 0, max: 360, label: 'Rotation' },
      global: { stubs: { Input } },
    });
    const input = wrapper.get('.big-slider-input');

    await input.trigger('pointerdown');
    (input.element as HTMLInputElement).value = '90';
    await input.trigger('input');
    (input.element as HTMLInputElement).value = '180';
    await input.trigger('input');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(frameCallbacks).toHaveLength(1);
    frameCallbacks[0]!(0);
    expect(wrapper.emitted('update:modelValue')).toEqual([[180]]);
    await input.trigger('change');
  });

  it('keeps repeated keyboard changes in one interaction until keyup', async () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const wrapper = mount(BigSlider, {
      props: { modelValue: 0, min: 0, max: 100, label: 'Opacity' },
      global: { stubs: { Input } },
    });
    const input = wrapper.get('.big-slider-input');

    await input.trigger('keydown', { key: 'ArrowRight' });
    (input.element as HTMLInputElement).value = '10';
    await input.trigger('input');
    await input.trigger('change');
    await input.trigger('keydown', { key: 'ArrowRight', repeat: true });
    (input.element as HTMLInputElement).value = '20';
    await input.trigger('input');

    expect(wrapper.emitted('interaction-start')).toHaveLength(1);
    expect(wrapper.emitted('interaction-end')).toBeUndefined();
    expect(frameCallbacks).toHaveLength(1);
    frameCallbacks[0]!(0);
    expect(wrapper.emitted('update:modelValue')).toEqual([[20]]);

    await input.trigger('keyup', { key: 'ArrowRight' });
    frameCallbacks[0]!(0);
    expect(wrapper.emitted('interaction-end')).toHaveLength(1);
    await input.trigger('change');
    expect(wrapper.emitted('interaction-end')).toHaveLength(1);
  });

  it('handles a fixed range and ignores non-range keyboard events', async () => {
    const wrapper = mount(BigSlider, {
      props: { modelValue: 10, min: 10, max: 10, defaultValue: 10, label: 'Fixed' },
      global: { stubs: { Input } },
    });
    const input = wrapper.get('.big-slider-input');

    await input.trigger('keydown', { key: 'a' });
    await input.trigger('keyup', { key: 'a' });

    expect(wrapper.emitted('interaction-start')).toBeUndefined();
    expect(wrapper.emitted('interaction-end')).toBeUndefined();
  });

  it('accepts a numeric editor value and tolerates enter followed by blur', async () => {
    const wrapper = mount(BigSlider, {
      attachTo: document.body,
      props: { modelValue: 50, min: 0, max: 100, label: 'Opacity' },
      global: { stubs: { Input } },
    });
    await wrapper.get('.big-slider-value').trigger('click');
    const editor = wrapper.findComponent(Input);

    editor.vm.$emit('update:modelValue', 75);
    editor.vm.$emit('keydown', new KeyboardEvent('keydown', { key: 'Enter' }));
    editor.vm.$emit('blur', new FocusEvent('blur'));
    await nextTick();

    expect(wrapper.emitted('update:modelValue')).toEqual([[75]]);
    wrapper.unmount();
  });

  it.each(['pointerup', 'blur'] as const)('flushes a pending range value on %s', async (endEvent) => {
    const frameCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const wrapper = mount(BigSlider, {
      props: { modelValue: 0, min: 0, max: 100, label: 'Opacity' },
      global: { stubs: { Input } },
    });
    const input = wrapper.get('.big-slider-input');

    await input.trigger('pointerdown');
    (input.element as HTMLInputElement).value = '35';
    await input.trigger('input');
    expect(frameCallbacks).toHaveLength(1);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();

    await input.trigger(endEvent);
    expect(wrapper.emitted('update:modelValue')).toEqual([[35]]);
    expect(wrapper.emitted('interaction-end')).toHaveLength(1);
  });

  it('cancels before flushing a pending value and does not cancel while idle', async () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    const cancelFrame = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    const order: string[] = [];
    const wrapper = mount(BigSlider, {
      props: {
        modelValue: 0,
        min: 0,
        max: 100,
        label: 'Opacity',
        onInteractionCancel: () => order.push('cancel'),
        'onUpdate:modelValue': () => order.push('update'),
        onInteractionEnd: () => order.push('end'),
      },
      global: { stubs: { Input } },
    });
    const input = wrapper.get('.big-slider-input');

    await input.trigger('pointerdown');
    (input.element as HTMLInputElement).value = '42';
    await input.trigger('input');
    await input.trigger('pointercancel');

    expect(frameCallbacks).toHaveLength(1);
    expect(cancelFrame).toHaveBeenCalledWith(1);
    expect(order).toEqual(['cancel', 'update', 'end']);
    expect(wrapper.emitted('interaction-cancel')).toEqual([[]]);
    expect(wrapper.emitted('update:modelValue')).toEqual([[42]]);
    expect(wrapper.emitted('interaction-end')).toEqual([[]]);

    await input.trigger('pointercancel');
    expect(wrapper.emitted('interaction-cancel')).toHaveLength(1);
  });
});
