import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ColorInput from '../ColorInput.vue';

const ColorPicker = {
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  template:
    '<button class="picker-stub" :disabled="disabled" @click="$emit(\'update:modelValue\', \'#123456\')">Pick</button>',
};

describe('ColorInput', () => {
  it('renders its label and forwards color updates', async () => {
    const wrapper = mount(ColorInput, {
      props: { modelValue: '#abcdef', label: 'Background', showLabel: true },
      global: { stubs: { ColorPicker } },
    });

    expect(wrapper.get('.color-input-label').text()).toBe('Background');
    await wrapper.get('.picker-stub').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['#123456']]);
  });

  it('hides the label when requested and forwards disabled state', () => {
    const wrapper = mount(ColorInput, {
      props: { modelValue: '#abcdef', label: 'Background', showLabel: false, disabled: true },
      global: { stubs: { ColorPicker } },
    });

    expect(wrapper.find('.color-input-label').exists()).toBe(false);
    expect(wrapper.get('.picker-stub').attributes('disabled')).toBeDefined();
  });
});
