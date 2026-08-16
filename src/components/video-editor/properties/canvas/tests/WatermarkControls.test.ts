import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import WatermarkControls from '../WatermarkControls.vue';
import { DEFAULT_WATERMARK, type WatermarkSettings } from '../../../canvas/output-canvas';

vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: () => ({
    t: (key: string) =>
      ({
        watermark: 'Watermark',
        watermarkDescription: 'Add a Beam signature',
        watermarkText: 'Watermark text',
        noWatermarkText: 'None',
        madeWithBeam: 'Made with Beam.',
        beam: 'Beam',
        showBeamLogo: 'Show Beam logo',
        translateWatermark: 'Translate watermark',
        watermarkPosition: 'Watermark position',
        watermarkTopLeft: 'Top left',
        watermarkTopRight: 'Top right',
        watermarkBottomLeft: 'Bottom left',
        watermarkBottomRight: 'Bottom right',
        watermarkSize: 'Watermark size',
      })[key] ?? key,
  }),
}));

vi.mock('~/utils/public-asset', () => ({ resolvePublicAssetUrl: (value: string) => value }));

const SwitchStub = {
  props: ['modelValue', 'ariaLabel'],
  emits: ['update:modelValue'],
  template:
    '<button class="switch-stub" type="button" :aria-label="ariaLabel" @click="$emit(\'update:modelValue\', !modelValue)">{{ modelValue }}</button>',
};

const ButtonStub = {
  inheritAttrs: false,
  props: ['icon', 'iconOnly', 'tooltip'],
  emits: ['click'],
  template:
    '<button v-bind="$attrs" class="button-stub" type="button" :title="tooltip" @click="$emit(\'click\')"><slot /></button>',
};

const ButtonGroupStub = {
  template: '<div class="button-group-stub"><slot /></div>',
};

const BigSliderStub = {
  props: ['modelValue', 'label'],
  emits: ['update:modelValue'],
  template:
    '<button class="slider-stub" type="button" :aria-label="label" @click="$emit(\'update:modelValue\', 140)">{{ modelValue }}</button>',
};

const mountControls = (modelValue: Partial<WatermarkSettings> = {}) =>
  mount(WatermarkControls, {
    props: { modelValue: { ...DEFAULT_WATERMARK, ...modelValue } },
    global: {
      stubs: {
        Switch: SwitchStub,
        Button: ButtonStub,
        ButtonGroup: ButtonGroupStub,
        BigSlider: BigSliderStub,
      },
    },
  });

const emittedValue = (wrapper: ReturnType<typeof mountControls>, index = -1): WatermarkSettings => {
  const values = wrapper.emitted('update:modelValue');
  if (!values?.length) throw new Error('Expected a watermark update.');
  return values.at(index)![0] as WatermarkSettings;
};

describe('WatermarkControls', () => {
  it('keeps the advanced controls collapsed while disabled', () => {
    const wrapper = mountControls({ enabled: false });

    expect(wrapper.find('.options').exists()).toBe(false);
    expect(wrapper.findAll('.switch-stub')).toHaveLength(1);
  });

  it('emits each watermark text mode and preserves the enabled state', async () => {
    const wrapper = mountControls({ enabled: true });
    const choices = wrapper.findAll('.button-stub');

    await choices[0]!.trigger('click');
    expect(emittedValue(wrapper).text).toBe('none');
    expect(emittedValue(wrapper).renderedText).toBe('');

    await choices[2]!.trigger('click');
    expect(emittedValue(wrapper).text).toBe('beam');
    expect(emittedValue(wrapper).renderedText).toBe('Beam');
    expect(emittedValue(wrapper).enabled).toBe(true);
  });

  it('emits logo and localized text changes', async () => {
    const wrapper = mountControls({ enabled: true, showLogo: true, text: 'made-with-beam' });
    const switches = wrapper.findAll('.switch-stub');

    await switches[1]!.trigger('click');
    expect(emittedValue(wrapper).showLogo).toBe(false);

    await switches[2]!.trigger('click');
    expect(emittedValue(wrapper).localized).toBe(true);
    expect(emittedValue(wrapper).renderedText).toBe('Made with Beam.');
  });

  it('emits each position and the slider size', async () => {
    const wrapper = mountControls({ enabled: true });
    const buttons = wrapper.findAll('.button-stub');

    await buttons[5]!.trigger('click');
    expect(emittedValue(wrapper).position).toBe('bottom-left');

    await wrapper.get('.slider-stub').trigger('click');
    expect(emittedValue(wrapper).size).toBe(140);
  });

  it('toggles the watermark and initializes the default text', async () => {
    const wrapper = mountControls({ enabled: false });

    await wrapper.get('.switch-stub').trigger('click');

    expect(emittedValue(wrapper)).toMatchObject({
      enabled: true,
      text: 'made-with-beam',
      showLogo: true,
      localized: false,
      renderedText: 'Made with Beam.',
    });
  });
});
