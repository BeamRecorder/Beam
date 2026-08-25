import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { describe, expect, it } from 'vitest';
import type { ColorClip } from '~/media/shared/composition-types';
import ColorLayerAppearanceControls from '../ColorLayerAppearanceControls.vue';

const Button = {
  inheritAttrs: false,
  props: ['variant', 'size', 'block', 'icon'],
  emits: ['click'],
  template:
    '<button v-bind="$attrs" :class="[\'btn\', $attrs.class]" :data-variant="variant" @click="$emit(\'click\')"><slot /></button>',
};
const BigSlider = defineComponent({
  name: 'BigSlider',
  props: { modelValue: Number, label: String, step: Number },
  emits: ['update:modelValue', 'interaction-start', 'interaction-end'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        {
          class: 'big-slider-stub',
          onClick: () => emit('update:modelValue', Number(props.modelValue) + Number(props.step)),
        },
        props.label,
      );
  },
});
const Switch = defineComponent({
  name: 'Switch',
  props: { modelValue: Boolean, label: String, ariaLabel: String },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        {
          class: 'switch-stub',
          'aria-label': props.ariaLabel || props.label,
          onClick: () => emit('update:modelValue', !props.modelValue),
        },
        props.label,
      );
  },
});
const ShadowDirectionGroup = defineComponent({
  name: 'ShadowDirectionGroup',
  template: '<button class="direction-stub">direction</button>',
});
const ColorPicker = defineComponent({ name: 'ColorPicker', template: '<button class="color-stub">color</button>' });

const colorClip = (style: Partial<ColorClip> = {}): ColorClip => ({
  id: 'color-clip',
  kind: 'color',
  name: 'Color layer',
  timelineStartMs: 0,
  timelineDurationMs: 3_000,
  sourceInMs: 0,
  sourceDurationMs: 3_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  assetId: '',
  transform: { x: 0, y: 0, width: 1, height: 1 },
  fill: { kind: 'color', color: '#111827' },
  opacityEnabled: true,
  opacity: 70,
  cornerRadius: 'none',
  shadowSize: 'none',
  shadowBlur: 40,
  shadowMode: 'solid',
  shadowColor: '#000000',
  shadowDirection: 'all',
  backdropBlurEnabled: false,
  backdropBlur: 35,
  ...style,
});

const mountAppearance = (clip = colorClip()) =>
  mount(ColorLayerAppearanceControls, {
    props: { clip },
    global: { stubs: { Button, BigSlider, Switch, ShadowDirectionGroup, ColorPicker } },
  });

describe('ColorLayerAppearanceControls', () => {
  it('uses media-style radius and shadow presets plus conditional advanced controls', async () => {
    const wrapper = mountAppearance();
    const radiusGroup = wrapper
      .findAll('.appearance-controls .btn-group')
      .find((group) => group.text().includes('16px'));
    await radiusGroup!
      .findAll('.btn')
      .find((button) => button.text() === '16px')!
      .trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([expect.objectContaining({ cornerRadius: expect.anything() })]);

    const shadowGroup = wrapper
      .findAll('.appearance-controls .btn-group')
      .find((group) => group.text().includes('Soft'));
    await shadowGroup!
      .findAll('.btn')
      .find((button) => button.text() === 'None')!
      .trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([expect.objectContaining({ shadowSize: 'none' })]);
    await shadowGroup!
      .findAll('.btn')
      .find((button) => button.text() === 'Soft')!
      .trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([expect.objectContaining({ shadowSize: 'sm' })]);

    const advanced = wrapper
      .findAll('.appearance-controls button')
      .find((button) => /custom|advanced/i.test(button.attributes('aria-label') ?? button.text()));
    await advanced!.trigger('click');
    await wrapper.setProps({ clip: colorClip({ cornerRadius: 'md', shadowSize: 'custom' }) });
    const slider = wrapper.findAllComponents(BigSlider).find((item) => /shadow/i.test(String(item.props('label'))));
    slider!.vm.$emit('update:modelValue', 44);
    expect(wrapper.emitted('update')).toContainEqual([
      expect.objectContaining({ shadowSize: 'custom', shadowBlur: 44 }),
    ]);
  });

  it('toggles opacity and backdrop blur and only shows their sliders when enabled', async () => {
    const wrapper = mountAppearance();
    const opacityToggle = wrapper
      .findAll('.switch-stub')
      .find((item) => /opacity/i.test(item.attributes('aria-label') ?? ''))!;
    const backdropToggle = wrapper
      .findAll('.switch-stub')
      .find((item) => /backdrop|background blur/i.test(item.attributes('aria-label') ?? ''))!;
    const opacitySlider = wrapper
      .findAllComponents(BigSlider)
      .find((item) => /opacity/i.test(String(item.props('label'))))!;
    opacitySlider.vm.$emit('update:modelValue', 61);
    expect(wrapper.emitted('update')).toContainEqual([{ opacity: 61 }]);
    await opacityToggle.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ opacityEnabled: false }]);

    await wrapper.setProps({ clip: colorClip({ opacityEnabled: false, opacity: 61 }) });
    expect(wrapper.findAllComponents(BigSlider).some((item) => /opacity/i.test(String(item.props('label'))))).toBe(
      false,
    );
    await backdropToggle.trigger('click');
    expect(wrapper.emitted('update')?.at(-1)).toEqual([{ backdropBlurEnabled: true }]);
    await wrapper.setProps({ clip: colorClip({ opacityEnabled: false, backdropBlurEnabled: true, backdropBlur: 40 }) });
    const backdropSlider = wrapper
      .findAllComponents(BigSlider)
      .find((item) => /backdrop|background blur/i.test(String(item.props('label'))))!;
    backdropSlider.vm.$emit('update:modelValue', 55);
    expect(wrapper.emitted('update')).toContainEqual([{ backdropBlur: 55 }]);
  });
});
