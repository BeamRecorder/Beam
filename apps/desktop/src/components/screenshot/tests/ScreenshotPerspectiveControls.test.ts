import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ScreenshotPerspectiveControls from '../ScreenshotPerspectiveControls.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
describe('Screenshot perspective inspector', () => {
  it('uses a retained inspector disclosure with neutral identity defaults', () => {
    const w = mount(ScreenshotPerspectiveControls);
    expect(w.get('.accordion-trigger').attributes('aria-expanded')).toBe('false');
    expect(w.findAllComponents(BigSlider).map((s) => s.props('modelValue'))).toEqual([0, 0, 1200]);
    w.unmount();
  });
  it.each([0, 1, 2])('updates field %s while preserving the other axes', (index) => {
    const value = { x: 25, y: -12, perspective: 900 },
      w = mount(ScreenshotPerspectiveControls, { props: { modelValue: value } });
    w.findAllComponents(BigSlider)[index]!.vm.$emit('update:modelValue', 44);
    expect(w.emitted('update:modelValue')).toEqual([[{ ...value, [['x', 'y', 'perspective'][index]!]: 44 }]]);
    w.unmount();
  });
  it('retains fractional values and exposes bounded camera distance', () => {
    const w = mount(ScreenshotPerspectiveControls, { props: { modelValue: { x: 13.375, y: 0, perspective: 1200 } } });
    expect(w.findAllComponents(BigSlider)[0]!.props('displayPrecision')).toBe(2);
    expect(w.findAllComponents(BigSlider)[2]!.props('min')).toBe(200);
    w.unmount();
  });
});

it('opens its inspector accordion and emits a first axis edit with camera defaults', async () => {
  const w = mount(ScreenshotPerspectiveControls);
  await w.get('.accordion-trigger').trigger('click');
  expect(w.get('.accordion-trigger').attributes('aria-expanded')).toBe('true');
  w.findAllComponents(BigSlider)[0]!.vm.$emit('update:modelValue', 12);
  expect(w.emitted('update:modelValue')).toEqual([[{ x: 12, y: 0, perspective: 1200 }]]);
  w.unmount();
});

it('keeps a locked inspector readable while preventing field edits', () => {
  const w = mount(ScreenshotPerspectiveControls, {
    props: { disabled: true, modelValue: { x: 24, y: 0, perspective: 1600 } },
  });
  expect(w.get('.perspective-controls').attributes('inert')).toBeDefined();
  w.findAllComponents(BigSlider)[0]!.vm.$emit('update:modelValue', 42);
  expect(w.emitted('update:modelValue')).toBeUndefined();
  w.unmount();
});
