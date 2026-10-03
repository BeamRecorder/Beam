import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MascotEyeControls from './MascotEyeControls.vue';
import Slider from '~/ui/slider/Slider.vue';
import { DEFAULT_EYE_GEOMETRY } from '../Beamy/engine/eye-geometry';

describe('mascot eye controls', () => {
  it('shows five accessible controls using the saved proportions', () => {
    const wrapper = mount(MascotEyeControls, {
      props: { modelValue: { ...DEFAULT_EYE_GEOMETRY, size: 1.4 } },
    });
    expect(wrapper.findAllComponents(Slider)).toHaveLength(5);
    expect(wrapper.get<HTMLInputElement>('input[aria-label="Taille des yeux"]').element.value).toBe('140');
    expect(wrapper.findAll('input[type="range"]').map((input) => input.attributes('aria-label'))).toEqual([
      'Taille des yeux',
      'Largeur des yeux',
      'Hauteur des yeux',
      'Écartement des yeux',
      'Position verticale',
    ]);
    wrapper.unmount();
  });
  it('emits a complete geometry with only the selected field updated and rejects invalid input', async () => {
    const wrapper = mount(MascotEyeControls, {
      props: { modelValue: { ...DEFAULT_EYE_GEOMETRY } },
    });
    const size = wrapper.findAllComponents(Slider)[0]!;
    for (const value of [50, 180]) size.vm.$emit('update:modelValue', value);
    expect(wrapper.emitted('update:modelValue')).toEqual([
      [{ ...DEFAULT_EYE_GEOMETRY, size: 0.5 }],
      [{ ...DEFAULT_EYE_GEOMETRY, size: 1.8 }],
    ]);
    for (const value of [NaN, Infinity, 49, 181]) size.vm.$emit('update:modelValue', value);
    expect(wrapper.emitted('update:modelValue')).toHaveLength(2);
    const position = wrapper.findAllComponents(Slider)[4]!;
    position.vm.$emit('update:modelValue', -20);
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([
      { ...DEFAULT_EYE_GEOMETRY, size: 1.8, offsetY: -0.2 },
    ]);
    wrapper.unmount();
  });
  it('resets every geometry parameter without touching shape, expression or color', async () => {
    const wrapper = mount(MascotEyeControls, {
      props: {
        modelValue: {
          size: 1.8,
          width: 1.2,
          height: 0.5,
          spacing: 0.6,
          offsetY: 0.2,
        },
      },
    });
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[{ ...DEFAULT_EYE_GEOMETRY }]]);
    wrapper.unmount();
  });
});
