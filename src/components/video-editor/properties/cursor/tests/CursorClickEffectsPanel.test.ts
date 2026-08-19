import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import CursorClickEffectsPanel from '../CursorClickEffectsPanel.vue';

const BigSlider = {
  emits: ['update:modelValue'],
  template: '<button class="effect-slider" @click="$emit(\'update:modelValue\', 55)">Slider</button>',
};
const Switch = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<button class="effect-switch" @click="$emit(\'update:modelValue\', !modelValue)">Switch</button>',
};
const ColorInput = {
  emits: ['update:modelValue'],
  template: '<button class="effect-color" @click="$emit(\'update:modelValue\', \'#abcdef\')">Color</button>',
};

const effects = {
  left: {
    springEnabled: true,
    springIntensity: 25,
    rippleEnabled: true,
    rippleStyle: 'single' as const,
    rippleSize: 30,
    rippleColor: '#111111',
  },
  right: {
    springEnabled: false,
    springIntensity: 40,
    rippleEnabled: false,
    rippleStyle: 'single' as const,
    rippleSize: 35,
    rippleColor: '#222222',
  },
};

describe('CursorClickEffectsPanel', () => {
  it('renders per-button spring and ripple controls and emits patches', async () => {
    const wrapper = mount(CursorClickEffectsPanel, {
      props: { modelValue: effects },
      global: { stubs: { BigSlider, Switch, ColorInput } },
    });
    expect(wrapper.findAll('.click-card')).toHaveLength(2);
    expect(wrapper.findAll('.effect-slider')).toHaveLength(2);
    expect(wrapper.findAll('.effect-color')).toHaveLength(1);
    await wrapper.find('.effect-color').trigger('click');
    await wrapper.findAll('.effect-switch')[0].trigger('click');
    await wrapper.find('.effect-slider').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toHaveLength(3);
    expect(wrapper.emitted('update:modelValue')?.[0][0]).toMatchObject({ left: { rippleColor: '#abcdef' } });
    expect(wrapper.findAll('.effect-button')).toHaveLength(0);
  });

  it('does not render optional controls when effects are disabled', () => {
    const wrapper = mount(CursorClickEffectsPanel, {
      props: {
        modelValue: { left: { ...effects.left, springEnabled: false, rippleEnabled: false }, right: effects.right },
      },
      global: { stubs: { BigSlider, Switch, ColorInput } },
    });
    expect(wrapper.findAll('.effect-slider')).toHaveLength(0);
    expect(wrapper.findAll('.effect-color')).toHaveLength(0);
  });

  it('toggles left and right ripple activation independently without changing the shared shape', async () => {
    const wrapper = mount(CursorClickEffectsPanel, {
      props: { modelValue: effects },
      global: { stubs: { BigSlider, Switch, ColorInput } },
    });
    const switches = wrapper.findAll('.effect-switch');

    await switches[1]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({
      left: { ...effects.left, rippleEnabled: false },
      right: effects.right,
    });

    await switches[3]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({
      left: effects.left,
      right: { ...effects.right, rippleEnabled: true },
    });
  });

  it('keeps ripple shape selection global instead of adding a selector to either click card', () => {
    const wrapper = mount(CursorClickEffectsPanel, {
      props: { modelValue: effects },
      global: { stubs: { BigSlider, Switch, ColorInput } },
    });

    expect(wrapper.findAll('.click-card select')).toHaveLength(0);
    expect(wrapper.findAll('.click-card [data-ripple-style]')).toHaveLength(0);
    expect(
      wrapper.findAll(
        '.click-card [aria-label="Single Ring"], .click-card [aria-label="Double Wave"], .click-card [aria-label="Burst"]',
      ),
    ).toHaveLength(0);
    expect(wrapper.findAll('.click-card').every((card) => !card.text().match(/Single Ring|Double Wave|Burst/))).toBe(
      true,
    );
  });
});
