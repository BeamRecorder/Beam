import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BlurPropertiesPanel from '../BlurPropertiesPanel.vue';

const Button = defineComponent({
  name: 'Button',
  emits: ['click'],
  setup(_, { emit, slots }) {
    return () => h('button', { class: 'button-stub', onClick: () => emit('click') }, slots.default?.());
  },
});
const BigSlider = defineComponent({
  name: 'BigSlider',
  props: { label: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        { class: 'slider-stub', 'data-label': props.label, onClick: () => emit('update:modelValue', 75) },
        props.label,
      );
  },
});
const ColorPicker = defineComponent({
  name: 'ColorPicker',
  emits: ['update:modelValue'],
  setup(_, { emit }) {
    return () => h('button', { class: 'color-stub', onClick: () => emit('update:modelValue', '#abcdef') }, 'color');
  },
});
const DeleteItem = defineComponent({
  name: 'DeleteItem',
  emits: ['click'],
  setup(_, { emit }) {
    return () => h('button', { class: 'delete-stub', onClick: () => emit('click') }, 'delete');
  },
});

const mountPanel = (tintOpacity = 0) =>
  mount(BlurPropertiesPanel, {
    props: {
      clip: {
        mode: 'blur',
        shape: 'rectangle',
        strength: 60,
        feather: 10,
        tintOpacity,
        color: '#000000',
        enabled: true,
      },
    },
    global: {
      stubs: {
        Button,
        ButtonGroup: { template: '<div><slot /></div>' },
        BigSlider,
        ColorPicker,
        DeleteItem,
        Divider: true,
      },
    },
  });

describe('BlurPropertiesPanel', () => {
  it('offers multiple privacy effects, shapes and intensity controls', async () => {
    const wrapper = mountPanel();
    const buttons = wrapper.findAll('.button-stub');
    expect(buttons.slice(0, 4).map((button) => button.text())).toEqual(['Blur', 'Frosted', 'Pixelated', 'Opaque']);
    expect(buttons.slice(4, 7).map((button) => button.text())).toEqual(['Rectangle', 'Square', 'Circle']);
    expect(wrapper.findAll('.slider-stub')).toHaveLength(3);

    await buttons[1].trigger('click');
    await buttons[5].trigger('click');
    for (const slider of wrapper.findAll('.slider-stub')) await slider.trigger('click');

    expect(wrapper.emitted('update')).toContainEqual([{ mode: 'frosted', tintOpacity: 24 }]);
    expect(wrapper.emitted('update')).toContainEqual([{ shape: 'square' }]);
    expect(wrapper.emitted('update')).toContainEqual([{ strength: 75 }]);
    expect(wrapper.emitted('update')).toContainEqual([{ feather: 75 }]);
    expect(wrapper.emitted('update')).toContainEqual([{ tintOpacity: 75 }]);
  });

  it('shows and updates tint color, enablement and deletion', async () => {
    const wrapper = mountPanel(20);
    await wrapper.get('.color-stub').trigger('click');
    await wrapper.findAll('.button-stub').at(-1)!.trigger('click');
    await wrapper.get('.delete-stub').trigger('click');

    expect(wrapper.emitted('update')).toContainEqual([{ color: '#abcdef' }]);
    expect(wrapper.emitted('update:enabled')).toEqual([[false]]);
    expect(wrapper.emitted('delete')).toHaveLength(1);
  });
});
