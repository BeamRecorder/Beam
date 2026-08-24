import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BorderAndFrameControls from '../BorderAndFrameControls.vue';

const Switch = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<button class="switch-stub" @click="$emit(\'update:modelValue\', !modelValue)">switch</button>',
};
const ColorPicker = {
  emits: ['update:modelValue'],
  template: '<button class="color-stub" @click="$emit(\'update:modelValue\', \'#123456\')">color</button>',
};
const BigSlider = {
  emits: ['update:modelValue'],
  template: '<button class="slider-stub" @click="$emit(\'update:modelValue\', 12)">slider</button>',
};
const Input = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<input id="frame-title" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
};
const Gradient = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<button class="gradient-stub">gradient</button>',
};
const Button = { template: '<button class="frame-button"><slot /></button>' };
const ButtonGroup = { template: '<div class="button-group"><slot /></div>' };

const global = {
  stubs: { Switch, ColorPicker, BigSlider, Input, Gradient, Button, ButtonGroup },
};

describe('BorderAndFrameControls', () => {
  it('toggles the border and emits its color and width changes', async () => {
    const wrapper = mount(BorderAndFrameControls, {
      props: { borderEnabled: false },
      global,
    });
    await wrapper.get('.switch-stub').trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ borderEnabled: true }]);

    await wrapper.setProps({
      borderEnabled: true,
      borderColor: '#000000',
      borderWidth: 2,
    });
    expect(wrapper.findAll('.color-stub')).toHaveLength(1);
    await wrapper.get('.color-stub').trigger('click');
    await wrapper.get('.slider-stub').trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ borderColor: '#123456' }]);
    expect(wrapper.emitted('update')).toContainEqual([{ borderWidth: 12 }]);
  });

  it('remembers the selected model when the frame is toggled off and back on', async () => {
    const wrapper = mount(BorderAndFrameControls, {
      props: { frame: 'none' },
      global,
    });

    const frameToggle = () => wrapper.findAll('.switch-stub')[1]!;
    const frameButton = (label: string) => wrapper.findAll('.frame-button').find((button) => button.text() === label);

    await frameToggle().trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ frame: 'safari' }]);

    await wrapper.setProps({
      frame: 'safari',
      frameTitle: '',
      frameChromeScale: 1,
    });
    expect(frameButton('Desktop')).toBeDefined();
    expect(frameButton('Phone')).toBeDefined();
    expect(frameButton('Safari')).toBeDefined();
    expect(frameButton('Windows 95')).toBeDefined();

    await frameButton('Windows 95')!.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ frame: 'windows-95' }]);
    await wrapper.setProps({
      frame: 'windows-95',
      frameShowMenu: true,
      frameShowScrollbars: true,
      frameChromeScale: 1,
    });
    expect(wrapper.find('#frame-title').exists()).toBe(true);
    expect(wrapper.findAll('.color-stub')).toHaveLength(1);
    expect(wrapper.findAll('.switch-stub')).toHaveLength(4);
    await wrapper.get('#frame-title').setValue('Demo');
    await wrapper.findAll('.color-stub')[0]!.trigger('click');
    await wrapper.findAll('.switch-stub')[2]!.trigger('click');
    await wrapper.findAll('.switch-stub')[3]!.trigger('click');
    await wrapper.get('.slider-stub').trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ frameTitle: 'Demo' }]);
    expect(wrapper.emitted('update')).toContainEqual([{ frameColor: '#123456' }]);
    expect(wrapper.emitted('update')).toContainEqual([{ frameShowMenu: false }]);
    expect(wrapper.emitted('update')).toContainEqual([{ frameShowScrollbars: false }]);
    expect(wrapper.emitted('update')).toContainEqual([{ frameChromeScale: 0.12 }]);

    await frameToggle().trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ frame: 'none' }]);
    await wrapper.setProps({ frame: 'none' });
    await frameToggle().trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ frame: 'windows-95' }]);
  });

  it('switches between desktop and phone models and hides desktop controls for phones', async () => {
    const wrapper = mount(BorderAndFrameControls, {
      props: { frame: 'safari' },
      global,
    });
    const frameButton = (label: string) => wrapper.findAll('.frame-button').find((button) => button.text() === label);

    expect(frameButton('Safari')).toBeDefined();
    expect(frameButton('Windows 95')).toBeDefined();
    expect(frameButton('iPhone 16 Pro Max')).toBeUndefined();
    expect(frameButton('Pixel 9 Pro')).toBeUndefined();
    expect(wrapper.find('#frame-title').exists()).toBe(true);
    expect(wrapper.find('.slider-stub').exists()).toBe(true);

    await frameButton('Phone')!.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ frame: 'iphone-16-max' }]);
    await wrapper.setProps({ frame: 'iphone-16-max' });

    expect(frameButton('Safari')).toBeUndefined();
    expect(frameButton('Windows 95')).toBeUndefined();
    expect(frameButton('iPhone 16 Pro Max')).toBeDefined();
    expect(frameButton('Pixel 9 Pro')).toBeDefined();
    expect(wrapper.find('#frame-title').exists()).toBe(false);
    expect(wrapper.find('.slider-stub').exists()).toBe(false);
    expect(wrapper.find('.phone-fill-controls').exists()).toBe(true);
    expect(wrapper.findAll('.color-stub')).toHaveLength(1);
    expect(wrapper.findAll('.switch-stub')).toHaveLength(2);

    await frameButton('Pixel 9 Pro')!.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ frame: 'pixel-9-pro' }]);
    await wrapper.setProps({ frame: 'pixel-9-pro' });
    expect(frameButton('Pixel 9 Pro')).toBeDefined();
  });

  it('only exposes the phone fit background controls for phone frames', async () => {
    const wrapper = mount(BorderAndFrameControls, {
      props: { frame: 'safari', phoneFrameFill: { kind: 'color', color: '#000000' } },
      global,
    });

    expect(wrapper.find('.phone-fill-controls').exists()).toBe(false);

    await wrapper.setProps({ frame: 'iphone-16-max' });
    expect(wrapper.find('.phone-fill-controls').exists()).toBe(true);
    expect(wrapper.find('.phone-fill-controls').findAll('.frame-button')).toHaveLength(3);

    await wrapper.setProps({ frame: 'safari' });
    expect(wrapper.find('.phone-fill-controls').exists()).toBe(false);
  });
});
