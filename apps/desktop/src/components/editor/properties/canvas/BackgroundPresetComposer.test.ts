import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BackgroundPresetComposer from './BackgroundPresetComposer.vue';

const gradient = {
  type: 'linear' as const,
  angle: 135,
  stops: [
    { id: 'a', position: 0, color: '#000000', alpha: 1 },
    { id: 'b', position: 1, color: '#ffffff', alpha: 1 },
  ],
};
const Button = {
  template: '<button @click="$emit(\'click\')"><slot /></button>',
};
const ColorPicker = {
  props: ['modelValue', 'inline', 'hideHeader', 'type'],
  template: '<button class="color" @click="$emit(\'update:modelValue\', \'#123456\')" />',
};
const Gradient = {
  props: ['modelValue'],
  template: '<button class="gradient" @click="$emit(\'update:modelValue\', { ...modelValue, angle: 42 })" />',
};

const mountComposer = (kind: 'color' | 'gradient') =>
  mount(BackgroundPresetComposer, {
    props: { kind, color: '#abcdef', gradient },
    global: { stubs: { Button, ColorPicker, Gradient } },
  });

describe('BackgroundPresetComposer', () => {
  it('adds the edited color only after confirmation', async () => {
    const wrapper = mountComposer('color');
    await wrapper.get('.color').trigger('click');
    expect(wrapper.emitted('add-color')).toBeUndefined();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Add')
      ?.trigger('click');
    expect(wrapper.emitted('add-color')?.at(-1)).toEqual(['#123456']);
  });

  it('adds a copied gradient draft after confirmation', async () => {
    const wrapper = mountComposer('gradient');
    await wrapper.get('.gradient').trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Add')
      ?.trigger('click');
    expect(wrapper.emitted('add-gradient')?.[0][0]).toMatchObject({
      angle: 42,
    });
    expect(gradient.angle).toBe(135);
  });

  it('closes without emitting an add event', async () => {
    const wrapper = mountComposer('color');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Close')
      ?.trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
    expect(wrapper.emitted('add-color')).toBeUndefined();
  });

  it('resets its drafts when the parent changes either preset value', async () => {
    const wrapper = mountComposer('color');
    await wrapper.setProps({
      color: '#fedcba',
      gradient: { ...gradient, angle: 77 },
    });
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Add')
      ?.trigger('click');
    expect(wrapper.emitted('add-color')?.at(-1)).toEqual(['#fedcba']);
    await wrapper.setProps({ kind: 'gradient' });
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Add')
      ?.trigger('click');
    expect(wrapper.emitted('add-gradient')?.at(-1)?.[0]).toMatchObject({
      angle: 77,
    });
  });
});

it('shows the same full standard picker surface as gradient stops, without an extra frame or header', () => {
  const wrapper = mountComposer('color');
  expect(wrapper.classes()).toContain('composer--color');
  expect(wrapper.findComponent(ColorPicker).props()).toMatchObject({
    inline: '',
    hideHeader: '',
    type: 'standard',
  });
  wrapper.unmount();
});
it('batches live edits once per frame and cancels pending work on disposal', async () => {
  let nextId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const request = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++nextId, callback);
    return nextId;
  });
  const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
  const wrapper = mountComposer('color');
  try {
    await wrapper.get('.color').trigger('click');
    await wrapper.setProps({ color: '#fedcba' });
    expect(frames.size).toBe(1);
    frames.values().next().value!(0);
    frames.clear();
    expect(wrapper.emitted('update-color')?.at(-1)).toEqual(['#fedcba']);
    await wrapper.setProps({ kind: 'gradient' });
    await wrapper.get('.gradient').trigger('click');
    await wrapper.setProps({ gradient: { ...gradient, angle: 51 } });
    expect(frames.size).toBe(1);
    frames.values().next().value!(0);
    frames.clear();
    expect(wrapper.emitted('update-gradient')?.at(-1)?.[0]).toMatchObject({ angle: 51 });
    await wrapper.get('.gradient').trigger('click');
    await wrapper.setProps({ kind: 'color' });
    await wrapper.get('.color').trigger('click');
    expect(frames.size).toBe(2);
    wrapper.unmount();
    expect(frames.size).toBe(0);
  } finally {
    wrapper.unmount();
    request.mockRestore();
    cancel.mockRestore();
  }
});
