import { afterEach, it, expect, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createDitheringEffect, DEFAULT_DITHERING_RECIPE } from '@beam/engine';
import ScreenshotDitheringPanel from './ScreenshotDitheringPanel.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Select from '~/ui/select/Select.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import Gradient from '~/ui/Gradient/Gradient.vue';
import Accordion from '~/ui/accordion/Accordion.vue';
vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
enableAutoUnmount(afterEach);
const panel = (disabled = false) =>
  mount(ScreenshotDitheringPanel, { props: { effect: createDitheringEffect('x'), disabled } });
it('publishes immutable live pattern and color settings with bounded values', () => {
  const wrapper = panel();
  wrapper.findComponent(BigSlider).vm.$emit('update:modelValue', 30);
  wrapper
    .findAllComponents(Select)
    .find((item) => item.props('options')?.[0]?.value === 2)!
    .vm.$emit('update:modelValue', 8);
  wrapper.findAllComponents(ColorPicker)[0]!.vm.$emit('update:modelValue', '#123456');
  expect(wrapper.emitted('update')).toEqual([
    [{ recipe: { ...DEFAULT_DITHERING_RECIPE, pixelSize: 16 } }],
    [{ recipe: { ...DEFAULT_DITHERING_RECIPE, matrixSize: 8 } }],
    [{ recipe: { ...DEFAULT_DITHERING_RECIPE, colors: ['#123456', '#ffffff'] } }],
  ]);
  expect(wrapper.props('effect').recipe).toEqual(DEFAULT_DITHERING_RECIPE);
});
it('rejects invalid values and guards disabled controls even for stale events', () => {
  const wrapper = panel();
  wrapper.findComponent(BigSlider).vm.$emit('update:modelValue', NaN);
  wrapper.findComponent(Select).vm.$emit('update:modelValue', 3);
  wrapper.findComponent(ColorPicker).vm.$emit('update:modelValue', 'invalid');
  expect(wrapper.emitted('update')).toBeUndefined();
  const disabled = panel(true);
  disabled.findComponent(BigSlider).vm.$emit('update:modelValue', 3);
  disabled
    .findAllComponents(BigSlider)
    .find((item) => item.props('label') === 'opacity')!
    .vm.$emit('update:modelValue', 40);
  expect(disabled.emitted('update')).toBeUndefined();
  expect(disabled.get('fieldset').attributes('inert')).toBeDefined();
});
it('edits a custom palette and forwards opacity, enable, reset, remove and back', async () => {
  const wrapper = panel();
  wrapper.getComponent(Gradient).vm.$emit('update:modelValue', {
    stops: [
      { id: 'a', position: 0, color: '#123456' },
      { id: 'b', position: 0.5, color: '#789abc' },
      { id: 'c', position: 1, color: '#def012' },
    ],
  });
  expect(wrapper.emitted('update')?.[0]).toEqual([
    { recipe: { ...DEFAULT_DITHERING_RECIPE, colors: ['#123456', '#789abc', '#def012'] } },
  ]);
  wrapper
    .findAllComponents(BigSlider)
    .find((item) => item.props('label') === 'opacity')!
    .vm.$emit('update:modelValue', 40);
  await wrapper.get('[role="switch"]').trigger('click');
  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'reset')!
    .trigger('click');
  expect(wrapper.emitted('update')?.slice(1)).toEqual([
    [{ opacity: 40 }],
    [{ enabled: false }],
    [{ recipe: DEFAULT_DITHERING_RECIPE }],
  ]);
  await wrapper.get('[aria-label="remove"]').trigger('click');
  await wrapper.get('[aria-label="back"]').trigger('click');
  expect(wrapper.emitted('remove')).toEqual([[]]);
  expect(wrapper.emitted('back')).toEqual([[]]);
});
it('keeps navigation separate from footer actions and groups controls into accessible disclosures', async () => {
  const wrapper = panel();
  expect(wrapper.find('.effect-navigation strong').exists()).toBe(false);
  expect(wrapper.find('.effect-navigation [aria-label="remove"]').exists()).toBe(false);
  expect(wrapper.find('.effect-footer [aria-label="remove"]').exists()).toBe(true);
  expect(wrapper.findAllComponents(Select).every((item) => item.props('size') === 'sm')).toBe(true);
  expect(wrapper.findAllComponents(Accordion).map((item) => item.props('title'))).toEqual([
    'palette',
    'surface',
    'adjustments',
  ]);
  for (const disclosure of wrapper.findAllComponents(Accordion)) {
    const open = disclosure.props('modelValue');
    await disclosure.get('.accordion-trigger').trigger('click');
    expect(disclosure.props('modelValue')).toBe(!open);
  }
});
it('offers JJN and palette mapping, rejects unknown selections and hides ordered-only controls for JJN', async () => {
  const wrapper = panel(),
    menus = wrapper.findAllComponents(Select);
  menus[0]!.vm.$emit('update:modelValue', 'jarvis-judice-ninke');
  menus[1]!.vm.$emit('update:modelValue', 'luminance');
  expect(wrapper.emitted('update')?.slice(0, 2)).toEqual([
    [{ recipe: { ...DEFAULT_DITHERING_RECIPE, algorithm: 'jarvis-judice-ninke' } }],
    [{ recipe: { ...DEFAULT_DITHERING_RECIPE, mapping: 'luminance' } }],
  ]);
  menus[0]!.vm.$emit('update:modelValue', 'unknown');
  menus[1]!.vm.$emit('update:modelValue', 'unknown');
  expect(wrapper.emitted('update')).toHaveLength(2);
  await wrapper.setProps({
    effect: {
      ...createDitheringEffect('x'),
      recipe: { ...DEFAULT_DITHERING_RECIPE, algorithm: 'jarvis-judice-ninke' },
    },
  });
  expect(wrapper.findAllComponents(Select)).toHaveLength(2);
  expect(wrapper.findAllComponents(BigSlider).map((item) => item.props('label'))).not.toContain('pixelSize');
});
it('bounds pixelation and source controls and rejects unfinished numeric edits', () => {
  const wrapper = panel(),
    sliders = wrapper.findAllComponents(BigSlider);
  const block = sliders.find((item) => item.props('label') === 'blockSize')!;
  block.vm.$emit('update:modelValue', 2.8);
  block.vm.$emit('update:modelValue', NaN);
  sliders.find((item) => item.props('label') === 'brightness')!.vm.$emit('update:modelValue', -10);
  sliders.find((item) => item.props('label') === 'contrast')!.vm.$emit('update:modelValue', 250);
  expect(wrapper.emitted('update')).toEqual([
    [{ recipe: { ...DEFAULT_DITHERING_RECIPE, blockSize: 3 } }],
    [{ recipe: { ...DEFAULT_DITHERING_RECIPE, brightness: 0 } }],
    [{ recipe: { ...DEFAULT_DITHERING_RECIPE, contrast: 200 } }],
  ]);
});
