import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import type { CaptionShapeStyle } from '~/media/shared/caption-shape-types';

const capture = vi.hoisted(() => ({
  listImportedFonts: vi.fn(),
  onFontLibraryChanged: vi.fn(),
  pickImportedFont: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));

import CaptionStyleControls from './CaptionStyleControls.vue';

const makeShapeStyle = (overrides: Partial<CaptionShapeStyle> = {}) => {
  const defaults = createDefaultCaptionStyle(42);
  return {
    ...defaults,
    shape: {
      ...defaults.shape,
      preset: 'rounded' as const,
      radius: 37,
      color: '#000000',
      opacity: 63,
      blur: 12,
      ...overrides,
    },
  };
};

const BigSlider = {
  props: {
    label: { type: String, default: '' },
    min: { type: Number, default: 0 },
    max: { type: Number, default: 0 },
    modelValue: { type: Number, default: 0 },
  },
  emits: ['update:modelValue'],
  template:
    '<button class="big-slider" :data-label="label" :data-max="max" :data-model-value="modelValue" @click="$emit(\'update:modelValue\', 80)">Slider</button>',
};
const ColorPicker = {
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  template: '<button class="color-picker" @click="$emit(\'update:modelValue\', \'#abcdef\')">Color</button>',
};
const Select = {
  props: { modelValue: { type: [String, Number], default: '' }, options: { type: Array, default: () => [] } },
  emits: ['update:modelValue', 'preview:modelValue', 'toggle'],
  template:
    '<button class="select" @click="$emit(\'update:modelValue\', options[0]?.value ?? modelValue)">{{ modelValue }}</button>',
};
const Switch = {
  inheritAttrs: true,
  props: { modelValue: { type: Boolean, default: false }, disabled: { type: Boolean, default: false } },
  emits: ['update:modelValue'],
  template:
    '<button class="switch" v-bind="$attrs" :disabled="disabled" :aria-checked="String(modelValue)" @click="$emit(\'update:modelValue\', !modelValue)">Switch</button>',
};
const Divider = { template: '<div class="divider" />' };
const Button = {
  inheritAttrs: true,
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
};
const ButtonGroup = {
  inheritAttrs: true,
  template: '<div class="button-group" v-bind="$attrs"><slot /></div>',
};
const BackdropBlurControl = {
  props: { modelValue: { type: Number, default: 0 } },
  emits: ['update:modelValue'],
  template:
    '<button class="backdrop-blur" :data-model-value="modelValue" @click="$emit(\'update:modelValue\', 18)">Blur</button>',
};
const Gradient = {
  props: { modelValue: { type: Object, default: () => ({ stops: [] }) } },
  emits: ['update:modelValue'],
  template: '<button class="gradient" @click="$emit(\'update:modelValue\', modelValue)">Gradient</button>',
};

beforeEach(() => {
  vi.clearAllMocks();
  capture.listImportedFonts.mockResolvedValue([]);
  capture.onFontLibraryChanged.mockReturnValue(() => undefined);
  capture.pickImportedFont.mockResolvedValue(null);
});

describe('CaptionStyleControls', () => {
  it('allows caption font sizes up to 256px', () => {
    const wrapper = mount(CaptionStyleControls, {
      props: { style: createDefaultCaptionStyle(42), defaultFontSize: 42 },
      global: {
        stubs: {
          BigSlider,
          ColorPicker,
          Select,
          Switch,
          Divider,
          Button,
          ButtonGroup,
          BackdropBlurControl,
        },
      },
    });

    const fontSizeSlider = wrapper.findAllComponents(BigSlider).find((slider) => slider.props('modelValue') === 42);

    expect(fontSizeSlider).toBeDefined();
    expect(fontSizeSlider!.props('max')).toBe(256);
    wrapper.unmount();
  });

  it('keeps word highlight controls hidden unless explicitly enabled', () => {
    const wrapper = mount(CaptionStyleControls, {
      props: { style: createDefaultCaptionStyle(42), defaultFontSize: 42 },
      global: {
        stubs: {
          BigSlider,
          ColorPicker,
          Select,
          Switch,
          Divider,
          Button,
          ButtonGroup,
          BackdropBlurControl,
          Gradient,
        },
      },
    });

    expect(wrapper.find('.highlight-controls').exists()).toBe(false);
  });

  it('shows an unavailable highlight switch without exposing its options', () => {
    const wrapper = mount(CaptionStyleControls, {
      props: {
        style: createDefaultCaptionStyle(42),
        defaultFontSize: 42,
        showWordHighlight: true,
        wordHighlightAvailable: false,
      },
      global: {
        stubs: {
          BigSlider,
          ColorPicker,
          Select,
          Switch,
          Divider,
          Button,
          ButtonGroup,
          BackdropBlurControl,
          Gradient,
        },
      },
    });

    const highlightSwitch = wrapper
      .findAllComponents(Switch)
      .find((component) => component.attributes('aria-label') === 'Highlight text');
    expect(highlightSwitch).toBeDefined();
    expect(highlightSwitch!.props('disabled')).toBe(true);
    expect(wrapper.find('.highlight-controls .select').exists()).toBe(false);
    expect(wrapper.find('.highlight-controls .availability-note').exists()).toBe(true);
  });

  it('emits highlight switch, display, fill, color, gradient, effect, and slider updates', async () => {
    const style = createDefaultCaptionStyle(42);
    const wrapper = mount(CaptionStyleControls, {
      props: {
        style,
        defaultFontSize: 42,
        showWordHighlight: true,
        wordHighlightAvailable: true,
      },
      global: {
        stubs: {
          BigSlider,
          ColorPicker,
          Select,
          Switch,
          Divider,
          Button,
          ButtonGroup,
          BackdropBlurControl,
          Gradient,
        },
      },
    });

    const highlightSwitch = wrapper
      .findAllComponents(Switch)
      .find((component) => component.attributes('aria-label') === 'Highlight text');
    expect(highlightSwitch).toBeDefined();
    highlightSwitch!.vm.$emit('update:modelValue', true);
    expect(wrapper.emitted('update')).toContainEqual(['wordHighlight', expect.objectContaining({ enabled: true })]);

    await wrapper.setProps({
      style: {
        ...style,
        wordHighlight: { ...style.wordHighlight, enabled: true },
      },
    });
    expect(wrapper.find('.highlight-controls').exists()).toBe(true);

    const displaySelect = wrapper
      .findAllComponents(Select)
      .find((component) => component.props('options')?.some((option: { value: string }) => option.value === 'word'));
    expect(displaySelect).toBeDefined();
    displaySelect!.vm.$emit('update:modelValue', 'word');
    expect(wrapper.emitted('update')).toContainEqual([
      'wordHighlight',
      expect.objectContaining({ displayMode: 'word' }),
    ]);

    const highlightColor = wrapper
      .findAllComponents(ColorPicker)
      .find((component) => component.props('modelValue') === style.wordHighlight.color);
    expect(highlightColor).toBeDefined();
    highlightColor!.vm.$emit('update:modelValue', '#00ff00');
    expect(wrapper.emitted('update')).toContainEqual(['wordHighlight', expect.objectContaining({ color: '#00ff00' })]);

    const effectSelect = wrapper
      .findAllComponents(Select)
      .find((component) => component.props('options')?.some((option: { value: string }) => option.value === 'pulse'));
    expect(effectSelect).toBeDefined();
    effectSelect!.vm.$emit('update:modelValue', 'jump');
    expect(wrapper.emitted('update')).toContainEqual(['wordHighlight', expect.objectContaining({ effect: 'jump' })]);

    const intensitySlider = wrapper
      .findAllComponents(BigSlider)
      .find((component) => component.props('modelValue') === style.wordHighlight.intensity);
    expect(intensitySlider).toBeDefined();
    intensitySlider!.vm.$emit('update:modelValue', 80);
    expect(wrapper.emitted('update')).toContainEqual(['wordHighlight', expect.objectContaining({ intensity: 80 })]);

    const gradientButton = wrapper.findAllComponents(Button).find((component) => component.text() === 'Gradient');
    expect(gradientButton).toBeDefined();
    await gradientButton!.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual(['wordHighlight', expect.objectContaining({ fill: 'gradient' })]);

    await wrapper.setProps({
      style: {
        ...style,
        wordHighlight: { ...style.wordHighlight, enabled: true, fill: 'gradient' },
      },
    });
    const gradient = wrapper.findComponent(Gradient);
    expect(gradient.exists()).toBe(true);
    const gradientValue = {
      type: 'linear' as const,
      angle: 180,
      stops: [
        { id: 'a', position: 0, color: '#111111' },
        { id: 'b', position: 1, color: '#eeeeee' },
      ],
    };
    gradient.vm.$emit('update:modelValue', gradientValue);
    expect(wrapper.emitted('update')).toContainEqual([
      'wordHighlight',
      expect.objectContaining({ gradient: gradientValue }),
    ]);
  });

  it('hides inactive opacity in one-word mode and disables all options for custom text', async () => {
    const style = createDefaultCaptionStyle(42);
    const wrapper = mount(CaptionStyleControls, {
      props: {
        style: {
          ...style,
          wordHighlight: { ...style.wordHighlight, enabled: true, displayMode: 'word' },
        },
        defaultFontSize: 42,
        showWordHighlight: true,
        wordHighlightAvailable: true,
      },
      global: {
        stubs: {
          BigSlider,
          ColorPicker,
          Select,
          Switch,
          Divider,
          Button,
          ButtonGroup,
          BackdropBlurControl,
          Gradient,
        },
      },
    });

    expect(
      wrapper
        .findAllComponents(BigSlider)
        .some((component) => component.props('modelValue') === style.wordHighlight.inactiveOpacity),
    ).toBe(false);

    await wrapper.setProps({
      style: {
        ...style,
        customText: 'Manual caption',
        wordHighlight: { ...style.wordHighlight, enabled: true, displayMode: 'sentence' },
      },
    });
    const highlightSwitch = wrapper
      .findAllComponents(Switch)
      .find((component) => component.attributes('aria-label') === 'Highlight text');
    expect(highlightSwitch!.props('disabled')).toBe(true);
    expect(wrapper.find('.highlight-controls .select').exists()).toBe(false);
  });

  it('exposes an accessible four-option shape preset group and emits the selected preset', async () => {
    const style = makeShapeStyle();
    const wrapper = mount(CaptionStyleControls, {
      props: { style, defaultFontSize: 42 },
      global: {
        stubs: {
          BigSlider,
          ColorPicker,
          Select,
          Switch,
          Divider,
          Button,
          ButtonGroup,
          BackdropBlurControl,
          Gradient,
        },
      },
    });

    const shapeGroup = wrapper.findAllComponents(ButtonGroup).find((group) => group.findAll('button').length === 4);
    expect(shapeGroup).toBeDefined();
    expect(shapeGroup!.attributes('aria-label')).toBeTruthy();

    const shapeButtons = shapeGroup!.findAll('button');
    expect(shapeButtons).toHaveLength(4);
    expect(new Set(shapeButtons.map((button) => button.attributes('aria-label'))).size).toBe(4);

    for (const [index, preset] of ['square', 'rounded', 'pill', 'custom'].entries()) {
      await shapeButtons[index].trigger('click');
      expect(wrapper.emitted('update')).toContainEqual(['shape', expect.objectContaining({ preset })]);
    }
  });

  it('shows the radius slider only for the custom shape preset and keeps its range bounded', async () => {
    const style = makeShapeStyle({ radius: 37 });
    const wrapper = mount(CaptionStyleControls, {
      props: { style, defaultFontSize: 42 },
      global: {
        stubs: {
          BigSlider,
          ColorPicker,
          Select,
          Switch,
          Divider,
          Button,
          ButtonGroup,
          BackdropBlurControl,
          Gradient,
        },
      },
    });

    const findRadiusSlider = () =>
      wrapper
        .findAllComponents(BigSlider)
        .find(
          (slider) =>
            slider.props('max') === 100 &&
            slider.props('min') === 0 &&
            slider.props('modelValue') === style.shape.radius,
        );

    expect(findRadiusSlider()).toBeUndefined();

    await wrapper.setProps({ style: { ...style, shape: { ...style.shape, preset: 'custom' } } });
    const radiusSlider = findRadiusSlider();
    expect(radiusSlider).toBeDefined();
    expect(radiusSlider!.props('min')).toBe(0);
    expect(radiusSlider!.props('max')).toBe(100);
    radiusSlider!.vm.$emit('update:modelValue', 74);
    expect(wrapper.emitted('update')).toContainEqual(['shape', expect.objectContaining({ radius: 74 })]);
  });

  it('exposes shape padding from 0 to 100 and emits it in the grouped shape update', () => {
    const style = makeShapeStyle({ padding: 24 });
    const wrapper = mount(CaptionStyleControls, {
      props: { style, defaultFontSize: 42 },
      global: {
        stubs: {
          BigSlider,
          ColorPicker,
          Select,
          Switch,
          Divider,
          Button,
          ButtonGroup,
          BackdropBlurControl,
          Gradient,
        },
      },
    });

    const paddingSlider = wrapper
      .findAllComponents(BigSlider)
      .find(
        (slider) =>
          slider.props('min') === 0 &&
          slider.props('max') === 100 &&
          slider.props('modelValue') === style.shape.padding,
      );

    expect(paddingSlider).toBeDefined();
    expect(paddingSlider!.props('min')).toBe(0);
    expect(paddingSlider!.props('max')).toBe(100);
    paddingSlider!.vm.$emit('update:modelValue', 58);

    expect(wrapper.emitted('update')).toContainEqual(['shape', expect.objectContaining({ padding: 58 })]);
  });

  it('routes shape color, opacity, and blur controls through the caption style update event', () => {
    const style = makeShapeStyle({ opacity: 63, blur: 12 });
    const wrapper = mount(CaptionStyleControls, {
      props: { style, defaultFontSize: 42 },
      global: {
        stubs: {
          BigSlider,
          ColorPicker,
          Select,
          Switch,
          Divider,
          Button,
          ButtonGroup,
          BackdropBlurControl,
          Gradient,
        },
      },
    });

    const shapeColor = wrapper
      .findAllComponents(ColorPicker)
      .find((picker) => picker.props('modelValue') === style.shape.color);
    expect(shapeColor).toBeDefined();
    shapeColor!.vm.$emit('update:modelValue', '#123456');
    expect(wrapper.emitted('update')).toContainEqual(['shape', expect.objectContaining({ color: '#123456' })]);

    const shapeOpacity = wrapper
      .findAllComponents(BigSlider)
      .find((slider) => slider.props('max') === 100 && slider.props('modelValue') === style.shape.opacity);
    expect(shapeOpacity).toBeDefined();
    shapeOpacity!.vm.$emit('update:modelValue', 81);
    expect(wrapper.emitted('update')).toContainEqual(['shape', expect.objectContaining({ opacity: 81 })]);

    const shapeBlur = wrapper
      .findAllComponents(BigSlider)
      .find((slider) => slider.props('max') === 48 && slider.props('modelValue') === style.shape.blur);
    expect(shapeBlur).toBeDefined();
    shapeBlur!.vm.$emit('update:modelValue', 18);
    expect(wrapper.emitted('update')).toContainEqual(['shape', expect.objectContaining({ blur: 18 })]);
  });
});
