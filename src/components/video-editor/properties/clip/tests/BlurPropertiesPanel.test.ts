import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { BlurClip } from '~/media/shared/composition-types';
import BlurPropertiesPanel from '../BlurPropertiesPanel.vue';

const Button = defineComponent({
  name: 'Button',
  inheritAttrs: false,
  emits: ['click'],
  setup(_, { attrs, emit, slots }) {
    return () =>
      h('button', { ...attrs, class: ['button-stub', attrs.class], onClick: () => emit('click') }, slots.default?.());
  },
});
const BigSlider = defineComponent({
  name: 'BigSlider',
  props: {
    label: { type: String, default: '' },
    modelValue: { type: Number, default: 0 },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        {
          class: 'slider-stub',
          'data-label': props.label,
          'data-value': props.modelValue,
          onClick: () => emit('update:modelValue', 75),
        },
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

type BlurPanelClip = Pick<BlurClip, 'mode' | 'shape' | 'strength' | 'feather' | 'tintOpacity' | 'color'> & {
  cornerRadius: number;
  enabled?: boolean;
};

const defaultClip = (): BlurPanelClip => ({
  mode: 'blur',
  shape: 'rectangle',
  strength: 60,
  feather: 10,
  cornerRadius: 0,
  tintOpacity: 0,
  color: '#000000',
  enabled: true,
});

const mountPanel = (overrides: Partial<BlurPanelClip> = {}) =>
  mount(BlurPropertiesPanel, {
    props: { clip: { ...defaultClip(), ...overrides } },
    global: {
      stubs: {
        Button,
        BigSlider,
        ColorPicker,
        DeleteItem,
        Divider: true,
      },
    },
  });

const buttonWithText = (element: Element, text: string) => {
  const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>('.button-stub'));
  const button = buttons.find((candidate) => candidate.textContent?.trim() === text);
  if (!button) throw new Error(`Missing button: ${text}`);
  return button;
};

describe('BlurPropertiesPanel', () => {
  it('separates presets, effects and shapes into readable control groups', () => {
    const wrapper = mountPanel();
    expect(wrapper.findAll('[data-preset]').map((button) => button.text())).toEqual(['Light', 'Privacy', 'Strong']);
    expect(['Blur', 'Frosted', 'Pixelated', 'Opaque'].every((label) => wrapper.text().includes(label))).toBe(true);
    expect(['Rectangle', 'Square', 'Circle'].every((label) => wrapper.text().includes(label))).toBe(true);
    const groups = wrapper.findAll('.btn-group');
    expect(groups).toHaveLength(3);
    expect(groups.map((group) => group.attributes('style'))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('--button-group-columns: 1'),
        expect.stringContaining('--button-group-columns: 2'),
        expect.stringContaining('--button-group-columns: 3'),
      ]),
    );
  });

  it('uses mode-specific labels and only shows color controls for color modes', async () => {
    const wrapper = mountPanel();
    expect(wrapper.findAll('.slider-stub').map((slider) => slider.attributes('data-label'))).toEqual([
      'Blur radius',
      'Edge softness',
      'Corner radius',
    ]);
    expect(wrapper.find('.color-stub').exists()).toBe(false);

    await wrapper.setProps({ clip: { ...defaultClip(), mode: 'frosted', tintOpacity: 24 } });
    expect(wrapper.findAll('.slider-stub').map((slider) => slider.attributes('data-label'))).toEqual([
      'Frost intensity',
      'Edge softness',
      'Corner radius',
      'Tint intensity',
    ]);
    expect(wrapper.find('.color-stub').exists()).toBe(true);

    await wrapper.setProps({ clip: { ...defaultClip(), mode: 'opaque' } });
    expect(wrapper.findAll('.slider-stub').map((slider) => slider.attributes('data-label'))).toEqual([
      'Edge softness',
      'Corner radius',
    ]);
    expect(wrapper.find('.color-stub').exists()).toBe(true);

    await wrapper.setProps({ clip: { ...defaultClip(), mode: 'pixelated', shape: 'circle' } });
    expect(wrapper.findAll('.slider-stub').map((slider) => slider.attributes('data-label'))).toEqual([
      'Pixel size',
      'Edge softness',
    ]);
    expect(wrapper.find('.color-stub').exists()).toBe(false);
  });

  it('applies light, privacy and strong presets without changing the selected shape', async () => {
    const wrapper = mountPanel({ shape: 'circle' });
    for (const preset of wrapper.findAll('[data-preset]')) await preset.trigger('click');

    expect(wrapper.emitted('update')).toContainEqual([{ mode: 'blur', strength: 30, feather: 14, tintOpacity: 0 }]);
    expect(wrapper.emitted('update')).toContainEqual([{ mode: 'pixelated', strength: 72, feather: 2, tintOpacity: 0 }]);
    expect(wrapper.emitted('update')).toContainEqual([
      { mode: 'opaque', strength: 100, feather: 0, tintOpacity: 0, color: '#000000' },
    ]);
    expect(
      wrapper
        .emitted('update')
        ?.flat()
        .some((patch) => 'shape' in (patch as object)),
    ).toBe(false);
  });

  it('updates modes, geometry, color, enablement and deletion', async () => {
    const wrapper = mountPanel({ mode: 'frosted', tintOpacity: 10 });
    buttonWithText(wrapper.element, 'Frosted').click();
    buttonWithText(wrapper.element, 'Pixelated').click();
    buttonWithText(wrapper.element, 'Square').click();
    for (const slider of wrapper.findAll('.slider-stub')) await slider.trigger('click');
    await wrapper.get('.color-stub').trigger('click');
    buttonWithText(wrapper.element, 'Disable').click();
    await wrapper.get('.delete-stub').trigger('click');

    expect(wrapper.emitted('update')).toContainEqual([{ mode: 'frosted', tintOpacity: 24 }]);
    expect(wrapper.emitted('update')).toContainEqual([{ mode: 'pixelated', tintOpacity: 0 }]);
    expect(wrapper.emitted('update')).toContainEqual([{ shape: 'square' }]);
    expect(wrapper.emitted('update')).toContainEqual([{ strength: 75 }]);
    expect(wrapper.emitted('update')).toContainEqual([{ feather: 75 }]);
    expect(wrapper.emitted('update')).toContainEqual([{ cornerRadius: 75 }]);
    expect(wrapper.emitted('update')).toContainEqual([{ tintOpacity: 75 }]);
    expect(wrapper.emitted('update')).toContainEqual([{ color: '#abcdef' }]);
    expect(wrapper.emitted('update:enabled')).toEqual([[false]]);
    expect(wrapper.emitted('delete')).toHaveLength(1);
  });
});
