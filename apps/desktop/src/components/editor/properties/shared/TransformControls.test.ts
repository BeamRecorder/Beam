import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vitest';
import TransformControls from './TransformControls.vue';
import Input from '~/ui/input/Input.vue';
import Select from '~/ui/select/Select.vue';
import AlignmentPad from '~/ui/alignment-pad/AlignmentPad.vue';
import { setCurrentLocale } from '~/i18n';
import { SUPPORTED_LOCALES } from '~/i18n/locales';
enableAutoUnmount(afterEach);
const transform = { x: 0.125, y: -0.25, width: 0.4, height: 0.2 };
const create = (showMirroring = true) =>
  mount(TransformControls, {
    props: { modelValue: transform, canvasSize: { width: 1000, height: 500 }, showMirroring },
  });
const last = (wrapper: ReturnType<typeof create>) => wrapper.emitted('update:modelValue')!.at(-1)![0];
it('lets a user type a full pixel size before validating it through the engine', async () => {
  const wrapper = create();
  const input = wrapper.get<HTMLInputElement>('input[aria-label="Width"]');
  for (const value of ['1', '10', '100', '1000']) await input.setValue(value);
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  expect(input.element.value).toBe('1000');
  await input.trigger('blur');
  expect(last(wrapper)).toEqual({ ...transform, width: 1, height: 0.5 });
  await wrapper.setProps({ modelValue: { ...transform, width: 1, height: 0.5 } });
  expect(input.element.value).toBe('1000');
});
it('shows precise X/Y and both dimensions with a locked ratio and no fabricated alignment', () => {
  const wrapper = create();
  expect(wrapper.findAll('input').map((field) => field.element.value)).toEqual(['12.5', '-25', '0', '400', '100']);
  expect(wrapper.get('[aria-label="Lock aspect ratio"]').attributes('aria-pressed')).toBe('true');
  expect(wrapper.findComponent(AlignmentPad).props('modelValue')).toBeNull();
});
it('edits coordinates, rejects unfinished/non-finite text and bounds valid numeric input', () => {
  const wrapper = create();
  const input = wrapper.findAllComponents(Input)[0]!;
  for (const value of ['', '  ', 'not a number', Infinity]) input.vm.$emit('update:modelValue', value);
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  input.vm.$emit('update:modelValue', '25');
  expect(last(wrapper)).toEqual({ ...transform, x: 0.25 });
  input.vm.$emit('update:modelValue', 900);
  expect(last(wrapper)).toEqual({ ...transform, x: 3 });
  wrapper.findAllComponents(Input)[1]!.vm.$emit('update:modelValue', -900);
  expect(last(wrapper)).toEqual({ ...transform, y: -3 });
});
it('preserves proportions when editing width or height and allows unlocking them', async () => {
  const wrapper = create();
  const inputs = wrapper.findAllComponents(Input);
  inputs[3]!.vm.$emit('update:modelValue', 800);
  expect(last(wrapper)).toEqual({ ...transform, width: 0.8, height: 0.4 });
  inputs[4]!.vm.$emit('update:modelValue', 200);
  expect(last(wrapper)).toEqual({ ...transform, width: 0.8, height: 0.4 });
  await wrapper.get('[aria-label="Lock aspect ratio"]').trigger('click');
  expect(wrapper.get('[aria-label="Lock aspect ratio"]').attributes('aria-pressed')).toBe('false');
  inputs[3]!.vm.$emit('update:modelValue', 700);
  expect(last(wrapper)).toEqual({ ...transform, width: 0.7 });
});
it('aligns through the pad without changing size, then reflects history/external placement', async () => {
  const wrapper = create();
  await wrapper.get('[aria-label="Bottom, Right"]').trigger('click');
  expect(last(wrapper)).toEqual({ ...transform, x: 0.6, y: 0.8 });
  await wrapper.setProps({ modelValue: { ...transform, x: 0.3, y: 0.4 } });
  expect(wrapper.findComponent(AlignmentPad).props('modelValue')).toEqual({ x: 0.5, y: 0.5 });
  await wrapper.setProps({ modelValue: { x: 0, y: 0, width: 1, height: 1 } });
  expect(wrapper.findComponent(AlignmentPad).props('modelValue')).toEqual({ x: 0.5, y: 0.5 });
});
it('aligns each dropdown axis independently while preserving the other free coordinate', () => {
  const wrapper = create();
  const selects = wrapper.findAllComponents(Select);
  selects[0]!.vm.$emit('update:modelValue', 1);
  expect(last(wrapper)).toEqual({ ...transform, x: 0.6 });
  selects[1]!.vm.$emit('update:modelValue', 0.5);
  expect(last(wrapper)).toEqual({ ...transform, y: 0.4 });
  const count = wrapper.emitted('update:modelValue')!.length;
  selects[0]!.vm.$emit('update:modelValue', 'invalid');
  expect(wrapper.emitted('update:modelValue')).toHaveLength(count);
});
it('retains both mirror actions with accessible pressed states and hides unsupported actions', async () => {
  const wrapper = create();
  await wrapper.setProps({ mirrored: false, mirroredY: true });
  await wrapper.get('[aria-label="Mirror horizontally"]').trigger('click');
  await wrapper.get('[aria-label="Mirror vertically"]').trigger('click');
  expect(wrapper.emitted('update:mirrored')).toEqual([[true]]);
  expect(wrapper.emitted('update:mirroredY')).toEqual([[false]]);
  await wrapper.setProps({ showMirroring: false });
  expect(wrapper.find('[aria-label="Mirror horizontally"]').exists()).toBe(false);
});
it.each(SUPPORTED_LOCALES)('translates the complete positioning controls in %s', async (locale) => {
  await setCurrentLocale(locale);
  const wrapper = create(false);
  expect(wrapper.text()).not.toContain('TransformControls.');
  expect(wrapper.findComponent(AlignmentPad).props('labels')).toMatchObject({
    group: expect.any(String),
    left: expect.any(String),
    bottom: expect.any(String),
  });
  expect(wrapper.findAll('input').every((input) => !!input.attributes('aria-label'))).toBe(true);
});

it('updates the pixel size display when canvas resolution changes without changing document placement', async () => {
  const wrapper = create(false);
  await wrapper.setProps({ canvasSize: { width: 1920, height: 1080 } });
  expect(
    wrapper
      .findAll('input')
      .slice(2)
      .map((field) => field.element.value),
  ).toEqual(['768', '216']);
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  expect(wrapper.text()).toContain('px');
});

it('switches size units without touching the document and edits percentages through the same proportional operation', async () => {
  const wrapper = create();
  const inputs = wrapper.findAllComponents(Input);
  inputs[3]!.vm.$emit('update:unit', '%');
  await wrapper.vm.$nextTick();
  expect(wrapper.findAll('input').map((field) => field.element.value)).toEqual(['12.5', '-25', '0', '40', '20']);
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  inputs[3]!.vm.$emit('update:modelValue', 80);
  expect(last(wrapper)).toEqual({ ...transform, width: 0.8, height: 0.4 });
  inputs[3]!.vm.$emit('update:unit', 'px');
  await wrapper.vm.$nextTick();
  expect(
    wrapper
      .findAll('input')
      .slice(3, 5)
      .map((field) => field.element.value),
  ).toEqual(['400', '100']);
  inputs[3]!.vm.$emit('update:unit', 'em');
  await wrapper.vm.$nextTick();
  expect(inputs[3]!.props('unit')).toBe('px');
});
