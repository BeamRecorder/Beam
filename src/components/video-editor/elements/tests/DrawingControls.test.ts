import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, type PropType } from 'vue';
import type { ColorFill } from '~/media/shared/color-fill-types';
import type { DrawingSettings } from '~/media/shared/element-types';
import DrawingControls from '../DrawingControls.vue';

vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: () => ({
    t: (key: string) => (key === 'strokeColor' ? 'Stroke color' : key),
  }),
}));

vi.mock('~/api/capture', () => ({ capture: {} }));

const ColorFillPresetControlsStub = defineComponent({
  name: 'ColorFillPresetControls',
  props: {
    modelValue: { type: Object as PropType<ColorFill>, required: true },
    label: { type: String, required: true },
  },
  emits: ['update:modelValue'],
  setup(props) {
    return () => h('div', { 'data-testid': 'color-fill-controls' }, props.label);
  },
});

const BigSliderStub = defineComponent({
  name: 'BigSlider',
  props: {
    modelValue: Number,
    label: String,
  },
  setup() {
    return () => h('div', { 'data-testid': 'big-slider' });
  },
});

const mountControls = (modelValue: DrawingSettings) =>
  mount(DrawingControls, {
    props: { modelValue },
    global: {
      stubs: {
        ColorFillPresetControls: ColorFillPresetControlsStub,
        BigSlider: BigSliderStub,
      },
    },
  });

const drawingSettings = (): DrawingSettings => ({
  smoothing: 65,
  strokeWidth: 8,
  color: '#445566',
});

const gradientFill: ColorFill = {
  kind: 'gradient',
  gradient: {
    type: 'linear',
    angle: 45,
    stops: [
      { id: 'start', position: 0, color: '#112233', alpha: 1 },
      { id: 'end', position: 1, color: '#aabbcc', alpha: 0.75 },
    ],
  },
};

describe('DrawingControls', () => {
  it('shows Stroke color with the legacy color as a solid-fill fallback', () => {
    const settings = drawingSettings();
    const wrapper = mountControls(settings);
    const fillControls = wrapper.findComponent(ColorFillPresetControlsStub);

    expect(fillControls.props('label')).toBe('Stroke color');
    expect(fillControls.text()).toBe('Stroke color');
    expect(fillControls.props('modelValue')).toEqual({ kind: 'color', color: settings.color });

    wrapper.unmount();
  });

  it('preserves a gradient fill without replacing the legacy color fallback', () => {
    const settings = drawingSettings();
    const wrapper = mountControls(settings);

    wrapper.findComponent(ColorFillPresetControlsStub).vm.$emit('update:modelValue', gradientFill);

    expect(wrapper.emitted('update:modelValue')).toEqual([[{ ...settings, fill: gradientFill }]]);

    wrapper.unmount();
  });

  it('synchronizes a solid fill emission to both fill and color', () => {
    const settings = drawingSettings();
    const fill: ColorFill = { kind: 'color', color: '#aabbcc' };
    const wrapper = mountControls(settings);

    wrapper.findComponent(ColorFillPresetControlsStub).vm.$emit('update:modelValue', fill);

    expect(wrapper.emitted('update:modelValue')).toEqual([[{ ...settings, color: fill.color, fill }]]);

    wrapper.unmount();
  });
});
