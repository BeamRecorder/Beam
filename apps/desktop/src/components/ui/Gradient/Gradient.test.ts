import { enableAutoUnmount, mount, flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import Gradient from './Gradient.vue';
import GradientStopRow from './GradientStopRow.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import { setCurrentLocale } from '~/i18n';
import { SUPPORTED_LOCALES } from '~/i18n/locales';
import type { GradientValue } from './gradient-types';
enableAutoUnmount(afterEach);
const base: GradientValue = {
  type: 'linear',
  angle: 45,
  stops: [
    { id: 'start', position: 0, color: '#000000', alpha: 1 },
    { id: 'end', position: 1, color: '#ffffff', alpha: 0.5 },
  ],
};
const mountGradient = (props = {}) =>
  mount(Gradient, { props: { modelValue: base, ...props }, attachTo: document.body });
const lastValue = (wrapper: ReturnType<typeof mountGradient>) =>
  wrapper.emitted('update:modelValue')?.at(-1)?.[0] as GradientValue;
describe('Gradient', () => {
  it('uses shared neutral controls, a preview and an always-visible stop list', () => {
    const wrapper = mountGradient({ showAngle: true });
    expect(wrapper.get('[role="group"]').classes()).toContain('variant-neutral');
    expect(wrapper.findAll('.gradient-stop-row')).toHaveLength(2);
    expect(wrapper.findAll('[role="slider"]')).toHaveLength(2);
    expect(wrapper.find('.stop-edit-form, .delete-zone').exists()).toBe(false);
    expect(wrapper.get('.gradient-preview > div').attributes('style')).toContain('45deg');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
  it('commits precise angles after typing and wraps the 90° action', async () => {
    const wrapper = mountGradient({ showAngle: true });
    const angle = wrapper.get('input[aria-label="Angle"]');
    await angle.setValue('350.75');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await angle.trigger('keydown', { key: 'Enter' });
    expect(lastValue(wrapper).angle).toBe(350.75);
    await wrapper.get('[aria-label="Rotate 90°"]').trigger('click');
    expect(lastValue(wrapper).angle).toBe(80.75);
  });
  it('switches to radial without changing stops and can switch back', async () => {
    const wrapper = mountGradient({ showAngle: true });
    await wrapper.findAll('[aria-pressed]')[1]!.trigger('click');
    expect(lastValue(wrapper)).toEqual({ ...base, type: 'radial' });
    expect(wrapper.find('input[aria-label="Angle"]').exists()).toBe(false);
    expect(wrapper.get('.gradient-preview > div').attributes('style')).toContain('radial-gradient');
    await wrapper.findAll('[aria-pressed]')[0]!.trigger('click');
    expect(lastValue(wrapper).type).toBe('linear');
  });
  it('retains the optional type/angle contract for limited fill editors', () => {
    const wrapper = mountGradient();
    expect(wrapper.find('.gradient-toolbar').exists()).toBe(false);
    expect(wrapper.findAll('.gradient-stop-row')).toHaveLength(2);
  });
  it('adds, reverses, selects and removes while preserving the minimum count', async () => {
    const wrapper = mountGradient({ maxStops: 3 });
    await wrapper.get('[aria-label="Add color stop"]').trigger('click');
    expect(lastValue(wrapper).stops[1]).toMatchObject({ position: 0.5, color: '#555555', alpha: 0.75 });
    expect(wrapper.get('[aria-label="Add color stop"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[aria-label="Reverse gradient"]').trigger('click');
    expect(lastValue(wrapper).stops[0]!.id).toBe('end');
    await wrapper.findAll('[aria-label="Remove color stop"]')[1]!.trigger('click');
    expect(lastValue(wrapper).stops).toHaveLength(2);
    expect(
      wrapper
        .findAll('[aria-label="Remove color stop"]')
        .every((button) => button.attributes('disabled') !== undefined),
    ).toBe(true);
  });
  it('edits each row color, position and alpha independently without moving focus during reordering', async () => {
    const wrapper = mountGradient();
    const position = wrapper.get('input[aria-label="Stop 1 position"]');
    await position.setValue('73.456');
    await position.trigger('blur');
    expect(lastValue(wrapper).stops[0]!.position).toBeCloseTo(0.73456);
    const alpha = wrapper.get('input[aria-label="Stop 1 opacity"]');
    await alpha.setValue('25');
    await alpha.trigger('blur');
    expect(lastValue(wrapper).stops[0]!.alpha).toBe(0.25);
    const color = wrapper.get('input[aria-label="Stop 1 color"]');
    await color.setValue('#ABC');
    await color.trigger('blur');
    expect(lastValue(wrapper).stops[0]!.color).toBe('#aabbcc');
    await wrapper.get('input[aria-label="Stop 2 position"]').trigger('focusin');
    expect(wrapper.findAll('.gradient-stop-row')[1]!.classes()).toContain('is-selected');
    await wrapper.get('[role="slider"]').trigger('click');
    expect(wrapper.findAll('.gradient-stop-row')[0]!.classes()).toContain('is-selected');
    await wrapper.findAll('.gradient-stop-row')[1]!.trigger('pointerdown');
    expect(wrapper.findAll('.gradient-stop-row')[1]!.classes()).toContain('is-selected');
  });
  it('relays a color popover alpha change into the existing document stop', async () => {
    const wrapper = mountGradient();
    const picker = wrapper.findAllComponents(ColorPicker)[1]!;
    picker.vm.$emit('update:alpha', 0.31);
    await flushPromises();
    expect(lastValue(wrapper).stops[1]!.alpha).toBe(0.31);
  });
  it('applies named custom presets through the shared popover', async () => {
    const wrapper = mountGradient({
      showAngle: true,
      maxStops: 3,
      presets: [
        { id: 'Custom', stops: [...base.stops].reverse() },
        { id: 'Empty', stops: [] },
        { id: 'Too many', stops: [...base.stops, ...base.stops] },
      ],
    });
    await wrapper.get('[aria-label="Presets"]').trigger('click');
    await flushPromises();
    const choices = document.querySelectorAll<HTMLButtonElement>('.gradient-presets button');
    expect(choices[1]!.disabled).toBe(true);
    expect(choices[2]!.disabled).toBe(true);
    choices[0]!.click();
    await flushPromises();
    expect(lastValue(wrapper).stops).toEqual(base.stops);
    expect(document.querySelector('.gradient-presets')).toBeNull();
  });
  it('restores document values from undo and keeps disabled controls inert', async () => {
    const wrapper = mountGradient({ showAngle: true, disabled: true });
    expect(wrapper.findAll('button').every((button) => button.attributes('disabled') !== undefined)).toBe(true);
    await wrapper.setProps({ modelValue: { ...base, angle: 91 } });
    expect(wrapper.get<HTMLInputElement>('input[aria-label="Angle"]').element.value).toBe('91');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
  it.each(SUPPORTED_LOCALES)('translates visible and accessible controls in %s', async (locale) => {
    await setCurrentLocale(locale);
    const wrapper = mountGradient({ showAngle: true });
    expect(wrapper.text()).not.toContain('Gradient.');
    for (const element of wrapper.findAll('[aria-label]')) {
      expect(element.attributes('aria-label')).not.toContain('Gradient.');
      expect(element.attributes('aria-label')!.length).toBeGreaterThan(0);
    }
  });
  it('keeps disabled or locked stop rows visible with an opaque default alpha', () => {
    const wrapper = mount(GradientStopRow, {
      props: {
        stop: { ...base.stops[0]!, alpha: undefined },
        index: 0,
        selected: false,
        removable: false,
        disabled: true,
      },
    });
    expect(wrapper.get<HTMLInputElement>('input[aria-label="Stop 1 opacity"]').element.value).toBe('100');
    expect(wrapper.get('[aria-label="Remove color stop"]').attributes('disabled')).toBeDefined();
    expect(wrapper.classes()).not.toContain('is-selected');
  });
});

it('uses the same color editing actions for procedural palettes without unsupported position or alpha controls', async () => {
  await setCurrentLocale('en');
  const wrapper = mountGradient({ palette: true, showAngle: true, maxStops: 3 });
  expect(wrapper.find('.gradient-toolbar').exists()).toBe(false);
  expect(wrapper.find('.gradient-column-labels').exists()).toBe(false);
  expect(wrapper.find('[role="slider"]').exists()).toBe(false);
  expect(wrapper.find('input[aria-label="Stop 1 position"]').exists()).toBe(false);
  expect(wrapper.find('input[aria-label="Stop 1 opacity"]').exists()).toBe(false);
  expect(wrapper.getComponent(ColorPicker).props('showAlpha')).toBe(false);
  await wrapper.get('[aria-label="Add color stop"]').trigger('click');
  expect(lastValue(wrapper).stops).toHaveLength(3);
  await wrapper.findAll('[aria-label="Remove color stop"]')[1]!.trigger('click');
  expect(lastValue(wrapper).stops).toHaveLength(2);
});
it('replaces the linear swatch with a caller supplied live preview', async () => {
  await setCurrentLocale('en');
  const wrapper = mount(Gradient, {
    props: { modelValue: base, palette: true },
    slots: { preview: '<canvas data-live-preview />' },
  });
  expect(wrapper.get('.gradient-preview').classes()).toContain('custom-preview');
  expect(wrapper.find('.gradient-preview canvas[data-live-preview]').exists()).toBe(true);
  expect(wrapper.find('.gradient-preview > div').exists()).toBe(false);
});
