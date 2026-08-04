import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import CursorPanel from './CursorPanel.vue';

const Select = {
  emits: ['update:modelValue'],
  template: '<button class="cursor-select" @click="$emit(\'update:modelValue\', \'pointer\')">Select</button>',
};
const BigSlider = {
  emits: ['update:modelValue'],
  template: '<button class="cursor-slider" @click="$emit(\'update:modelValue\', 30)">Slider</button>',
};
const ColorInput = {
  emits: ['update:modelValue'],
  template: '<button class="cursor-color" @click="$emit(\'update:modelValue\', \'#fff\')">Color</button>',
};
const Switch = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<button class="cursor-switch" @click="$emit(\'update:modelValue\', !modelValue)">Switch</button>',
};
const ShadowDirectionGroup = {
  emits: ['update:modelValue'],
  template: '<button class="shadow-direction" @click="$emit(\'update:modelValue\', \'top-left\')">Direction</button>',
};
const CursorClickEffectsPanel = {
  emits: ['update:modelValue'],
  template: '<button class="click-effects-stub" @click="$emit(\'update:modelValue\', {})">Clicks</button>',
};

describe('CursorPanel', () => {
  it('emits cursor and shadow property updates', async () => {
    const wrapper = mount(CursorPanel, {
      props: {
        selectedCursor: 'default',
        cursorSize: 24,
        cursorColor: '#000',
        enableShadow: true,
        shadowBlur: 8,
        shadowColor: '#111',
        shadowDirection: 'bottom-right',
        motion: { preset: 'smooth' as const, smoothing: 0.67, springMassMultiplier: 1.29, motionBlur: 0.4 },
        clickEffects: {
          left: { springEnabled: false, springIntensity: 0, rippleEnabled: false, rippleSize: 20, rippleColor: '#000' },
          right: {
            springEnabled: false,
            springIntensity: 0,
            rippleEnabled: false,
            rippleSize: 20,
            rippleColor: '#000',
          },
        },
      },
      global: { stubs: { Select, BigSlider, ColorInput, Switch, ShadowDirectionGroup, CursorClickEffectsPanel } },
    });
    expect(wrapper.find('.nested-options').exists()).toBe(true);
    await wrapper.get('.cursor-select').trigger('click');
    await wrapper.get('.cursor-slider').trigger('click');
    await wrapper.findAll('.cursor-color')[0].trigger('click');
    await wrapper.findAll('.cursor-slider')[1].trigger('click');
    await wrapper.get('.cursor-switch').trigger('click');
    await wrapper.findAll('.cursor-color')[1].trigger('click');
    await wrapper.get('.shadow-direction').trigger('click');
    await wrapper.get('.click-effects-stub').trigger('click');
    expect(wrapper.emitted('update:selectedCursor')).toEqual([['pointer']]);
    expect(wrapper.emitted('update:cursorSize')).toEqual([[30]]);
    expect(wrapper.emitted('update:cursorColor')).toEqual([['#fff']]);
    expect(wrapper.emitted('update:enableShadow')).toEqual([[false]]);
    expect(wrapper.emitted('update:shadowBlur')).toEqual([[30]]);
    expect(wrapper.emitted('update:shadowDirection')).toEqual([['top-left']]);
    expect(wrapper.emitted('update:clickEffects')).toEqual([[{}]]);
  });

  it('hides nested shadow settings when shadow is disabled', () => {
    const wrapper = mount(CursorPanel, {
      props: {
        selectedCursor: 'default',
        cursorSize: 24,
        cursorColor: '#000',
        enableShadow: false,
        shadowBlur: 8,
        shadowColor: '#111',
        shadowDirection: 'bottom-right',
        motion: { preset: 'smooth' as const, smoothing: 0.67, springMassMultiplier: 1.29, motionBlur: 0.4 },
        clickEffects: {
          left: { springEnabled: false, springIntensity: 0, rippleEnabled: false, rippleSize: 20, rippleColor: '#000' },
          right: {
            springEnabled: false,
            springIntensity: 0,
            rippleEnabled: false,
            rippleSize: 20,
            rippleColor: '#000',
          },
        },
      },
      global: { stubs: { Select, BigSlider, ColorInput, Switch, ShadowDirectionGroup, CursorClickEffectsPanel } },
    });
    expect(wrapper.find('.nested-options').exists()).toBe(false);
  });
});
