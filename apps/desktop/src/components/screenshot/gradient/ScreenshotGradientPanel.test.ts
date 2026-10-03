import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { createGradientEffect, GRADIENT_PRESETS, GRADIENT_RANGES } from '@beam/engine';
import { GRADIENT_CONTROL_GROUPS } from './gradient-controls';
import Gradient from '~/ui/Gradient/Gradient.vue';
import ScreenshotGradientPanel from './ScreenshotGradientPanel.vue';
vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
const Slider = defineComponent({
  props: ['modelValue', 'label', 'min', 'max', 'step', 'defaultValue', 'formatValue'],
  emits: ['update:modelValue'],
  template:
    '<input :data-field="label" :data-formatted="formatValue?.(Number(modelValue))" :value="modelValue" @input="$emit(\'update:modelValue\',Number($event.target.value))" />',
});
const Select = defineComponent({
  props: ['modelValue', 'options'],
  emits: ['update:modelValue'],
  template:
    '<select :value="modelValue" @change="$emit(\'update:modelValue\',$event.target.value)"><option v-for="option in options" :value="option.value">{{option.label}}</option></select>',
});
const Picker = defineComponent({
  props: ['modelValue', 'label'],
  emits: ['update:modelValue'],
  template:
    '<input :data-color="label" :value="modelValue" @input="$emit(\'update:modelValue\',$event.target.value)" />',
});
const panel = (disabled = false) =>
  mount(ScreenshotGradientPanel, {
    props: { effect: createGradientEffect('test'), disabled },
    global: {
      stubs: {
        BigSlider: Slider,
        ScreenshotGradientPreview: true,
        Select,
        ColorPicker: Picker,
        Accordion: defineComponent({
          props: ['modelValue', 'title'],
          emits: ['update:modelValue'],
          template:
            '<section><button :data-accordion="title" @click="$emit(\'update:modelValue\',!modelValue)">{{title}}</button><slot /></section>',
        }),
      },
    },
  });
describe('Gradient inspector accordions', () => {
  it('offers each real shader parameter exactly once with its engine range and presets', async () => {
    const wrapper = panel();
    expect(GRADIENT_CONTROL_GROUPS.flatMap((group) => group.keys).sort()).toEqual(Object.keys(GRADIENT_RANGES).sort());
    for (const key of Object.keys(GRADIENT_RANGES)) expect(wrapper.findAll(`[data-field="${key}"]`)).toHaveLength(1);
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Ember'))!
      .trigger('click');
    expect(wrapper.emitted('update')?.[0]).toEqual([{ recipe: GRADIENT_PRESETS[1]!.recipe }]);
    wrapper.unmount();
  });
  it('rounds integer seeds/octaves, edits complete palettes and retains the rest of the recipe', async () => {
    const wrapper = panel();
    await wrapper.get('[data-field="seed"]').setValue('42.4');
    expect(wrapper.emitted('update')?.[0]).toEqual([{ recipe: expect.objectContaining({ seed: 42, mode: 'flow' }) }]);
    await wrapper.get('[data-color="background"]').setValue('#ffffff');
    expect(wrapper.emitted('update')?.[1]).toEqual([{ recipe: expect.objectContaining({ background: '#ffffff' }) }]);
    await wrapper
      .findAll('button')
      .find((button) => button.attributes('aria-label') === 'addStop')!
      .trigger('click');
    expect((wrapper.emitted('update')?.[2]?.[0] as { recipe: { colors: string[] } }).recipe.colors).toHaveLength(5);
    wrapper.unmount();
  });
  it('prevents edits on locked/disabled layers and enforces two-to-eight palette colors', async () => {
    const wrapper = panel(true);
    await wrapper.get('[data-field="grain"]').setValue('50');
    expect(wrapper.emitted('update')).toBeUndefined();
    await wrapper.setProps({
      disabled: false,
      effect: {
        ...createGradientEffect('test'),
        recipe: { ...createGradientEffect('test').recipe, colors: ['#000000', '#ffffff'] },
      },
    });
    expect(
      wrapper.findAll('button[aria-label="removeStop"]').every((button) => button.attributes('disabled') !== undefined),
    ).toBe(true);
    await wrapper.setProps({
      effect: {
        ...createGradientEffect('test'),
        recipe: { ...createGradientEffect('test').recipe, colors: Array(8).fill('#ffffff') },
      },
    });
    expect(
      wrapper
        .findAll('button')
        .find((button) => button.attributes('aria-label') === 'addStop')!
        .attributes('disabled'),
    ).toBeDefined();
    wrapper.unmount();
  });
});

it('routes opacity, blending, style, enable/delete and palette actions through the effect contract', async () => {
  const wrapper = panel();
  for (const button of wrapper.findAll('[data-accordion]')) await button.trigger('click');
  await wrapper.get('button[aria-label="back"]').trigger('click');
  expect(wrapper.emitted('back')).toHaveLength(1);
  await wrapper.get('select').setValue('overlay');
  await wrapper.findAll('select')[1]!.setValue('mesh');
  await wrapper.get('input[aria-label="opacity"]').setValue('45');
  await wrapper.get('input[aria-label="opacity"]').trigger('blur');
  await wrapper.get('[role="switch"]').trigger('click');
  await wrapper.get('[data-color="stopColor"]').setValue('#123456');
  await wrapper.get('button[aria-label="removeStop"]').trigger('click');
  await wrapper.get('button[aria-label="remove"]').trigger('click');
  expect(wrapper.emitted('update')).toContainEqual([{ blendMode: 'overlay' }]);
  expect(wrapper.emitted('update')).toContainEqual([{ opacity: 45 }]);
  expect(wrapper.emitted('update')).toContainEqual([{ enabled: false }]);
  expect(wrapper.emitted('remove')).toHaveLength(1);
  wrapper.unmount();
});

it('reuses the shared palette editor, retains stop identities and refreshes an externally replaced palette', async () => {
  const wrapper = panel();
  const gradient = wrapper.getComponent(Gradient);
  expect(gradient.props('palette')).toBe(true);
  expect(gradient.props('minStops')).toBe(2);
  expect(gradient.props('maxStops')).toBe(8);
  expect(
    wrapper.find('.gradient-preview .gradient-live-preview').exists() ||
      wrapper.find('screenshot-gradient-preview-stub').exists(),
  ).toBe(true);
  const value = {
    stops: [
      { id: 'stable-a', color: '#123456', position: 0 },
      { id: 'stable-b', color: '#abcdef', position: 1 },
    ],
  };
  gradient.vm.$emit('update:modelValue', value);
  await wrapper.setProps({
    effect: {
      ...createGradientEffect('test'),
      recipe: { ...createGradientEffect('test').recipe, colors: ['#123456', '#abcdef'] },
    },
  });
  expect((gradient.props('modelValue') as { stops: { id: string }[] }).stops.map((stop) => stop.id)).toEqual([
    'stable-a',
    'stable-b',
  ]);
  await wrapper.setProps({ effect: createGradientEffect('test') });
  expect((gradient.props('modelValue') as { stops: { color: string }[] }).stops.map((stop) => stop.color)).toEqual(
    createGradientEffect('test').recipe.colors,
  );
  const count = wrapper.emitted('update')!.length;
  for (const stops of [
    [],
    [{ color: '#ffffff', id: 'a', position: 0 }],
    Array(9).fill({ color: '#ffffff', id: 'a', position: 0 }),
    [
      { color: 'invalid', id: 'a', position: 0 },
      { color: '#ffffff', id: 'b', position: 1 },
    ],
  ])
    gradient.vm.$emit('update:modelValue', { stops });
  expect(wrapper.emitted('update')!.length).toBe(count);
  await wrapper.setProps({ disabled: true });
  gradient.vm.$emit('update:modelValue', value);
  expect(wrapper.emitted('update')!.length).toBe(count);
  wrapper.unmount();
});
