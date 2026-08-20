import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';

const capture = vi.hoisted(() => ({
  listImportedFonts: vi.fn(),
  onFontLibraryChanged: vi.fn(),
  pickImportedFont: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));

import CaptionStyleControls from './CaptionStyleControls.vue';

const BigSlider = {
  props: {
    label: { type: String, default: '' },
    max: { type: Number, default: 0 },
    modelValue: { type: Number, default: 0 },
  },
  template: '<div class="big-slider" :data-label="label" :data-max="max" :data-model-value="modelValue" />',
};
const ColorPicker = { template: '<div class="color-picker" />' };
const Select = { template: '<div class="select" />' };
const Switch = { template: '<div class="switch" />' };
const Divider = { template: '<div class="divider" />' };
const Button = { template: '<button><slot /></button>' };
const ButtonGroup = { template: '<div><slot /></div>' };
const BackdropBlurControl = { template: '<div class="backdrop-blur" />' };

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

    const fontSizeSlider = wrapper
      .findAllComponents(BigSlider)
      .find((slider) => slider.props('modelValue') === 42);

    expect(fontSizeSlider).toBeDefined();
    expect(fontSizeSlider!.props('max')).toBe(256);
    wrapper.unmount();
  });
});
