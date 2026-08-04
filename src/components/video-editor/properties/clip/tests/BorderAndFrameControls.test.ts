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
const Button = { template: '<button class="frame-button"><slot /></button>' };
const ButtonGroup = { template: '<div class="button-group"><slot /></div>' };

const global = {
  stubs: { Switch, ColorPicker, BigSlider, Input, Button, ButtonGroup },
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

  it('supports Safari and Windows 95 frame options and their settings', async () => {
    const wrapper = mount(BorderAndFrameControls, {
      props: { frame: 'none' },
      global,
    });
    const buttons = wrapper.findAll('.frame-button');
    expect(buttons).toHaveLength(3);
    await buttons[1]!.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ frame: 'safari' }]);

    await wrapper.setProps({
      frame: 'windows-95',
      frameShowMenu: true,
      frameShowScrollbars: true,
      frameChromeScale: 1,
    });
    expect(wrapper.find('#frame-title').exists()).toBe(true);
    expect(wrapper.findAll('.color-stub')).toHaveLength(1);
    expect(wrapper.findAll('.switch-stub')).toHaveLength(3);
    await wrapper.get('#frame-title').setValue('Demo');
    await wrapper.findAll('.color-stub')[0]!.trigger('click');
    await wrapper.findAll('.switch-stub')[1]!.trigger('click');
    await wrapper.findAll('.switch-stub')[2]!.trigger('click');
    await wrapper.get('.slider-stub').trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ frameTitle: 'Demo' }]);
    expect(wrapper.emitted('update')).toContainEqual([{ frameColor: '#123456' }]);
    expect(wrapper.emitted('update')).toContainEqual([{ frameShowMenu: false }]);
    expect(wrapper.emitted('update')).toContainEqual([{ frameShowScrollbars: false }]);
    expect(wrapper.emitted('update')).toContainEqual([{ frameChromeScale: 0.12 }]);
  });
});
