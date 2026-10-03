import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it } from 'vitest';
import MediaOrientationControls from './MediaOrientationControls.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import { setCurrentLocale } from '~/i18n';
import { SUPPORTED_LOCALES } from '~/i18n/locales';
enableAutoUnmount(afterEach);
beforeEach(() => setCurrentLocale('en'));
it('renders four separate icon buttons with meaningful accessible names', () => {
  const wrapper = mount(MediaOrientationControls);
  expect(wrapper.findAll('button').map((button) => button.attributes('aria-label'))).toEqual([
    'Mirror horizontally',
    'Mirror vertically',
    'Rotate 90° left',
    'Rotate 90° right',
  ]);
  expect(wrapper.findComponent(ButtonGroup).exists()).toBe(false);
  expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe('Orientation');
});
it('toggles mirrors independently and reflects externally restored values', async () => {
  const wrapper = mount(MediaOrientationControls, { props: { mirrored: true, mirroredY: false } });
  await wrapper.get('[aria-label="Mirror horizontally"]').trigger('click');
  await wrapper.get('[aria-label="Mirror vertically"]').trigger('click');
  expect(wrapper.emitted('update:mirrored')).toEqual([[false]]);
  expect(wrapper.emitted('update:mirroredY')).toEqual([[true]]);
  await wrapper.setProps({ mirrored: false, mirroredY: true });
  expect(wrapper.get('[aria-label="Mirror horizontally"]').attributes('aria-pressed')).toBe('false');
  expect(wrapper.get('[aria-label="Mirror vertically"]').attributes('aria-pressed')).toBe('true');
  expect(wrapper.emitted('update:rotation')).toBeUndefined();
});
it('turns both ways by 90°, wraps complete turns and uses restored fractional angles', async () => {
  const wrapper = mount(MediaOrientationControls);
  await wrapper.get('[aria-label="Rotate 90° left"]').trigger('click');
  await wrapper.get('[aria-label="Rotate 90° right"]').trigger('click');
  expect(wrapper.emitted('update:rotation')).toEqual([[270], [90]]);
  await wrapper.setProps({ rotation: 270 });
  await wrapper.get('[aria-label="Rotate 90° right"]').trigger('click');
  expect(wrapper.emitted('update:rotation')!.at(-1)).toEqual([0]);
  await wrapper.setProps({ rotation: 45.5 });
  await wrapper.get('[aria-label="Rotate 90° left"]').trigger('click');
  expect(wrapper.emitted('update:rotation')!.at(-1)).toEqual([315.5]);
  expect(wrapper.emitted('update:mirrored')).toBeUndefined();
});
it.each(SUPPORTED_LOCALES)('translates all four orientation actions in %s', async (locale) => {
  await setCurrentLocale(locale);
  const wrapper = mount(MediaOrientationControls);
  expect(
    wrapper.findAll('button').every((button) => {
      const label = button.attributes('aria-label');
      return label && !label.includes('TransformControls.') && !label.includes('ClipPropertiesPanel.');
    }),
  ).toBe(true);
});

it('accepts a fractional angle only on commit and retains it through quarter turns', async () => {
  const wrapper = mount(MediaOrientationControls, { props: { rotation: 20 } });
  const field = wrapper.get('input[aria-label="Rotation"]');
  await field.setValue('32.75');
  expect(wrapper.emitted('update:rotation')).toBeUndefined();
  await field.trigger('blur');
  expect(wrapper.emitted('update:rotation')).toEqual([[32.75]]);
  await wrapper.setProps({ rotation: 32.75 });
  await wrapper.get('[aria-label="Rotate 90° right"]').trigger('click');
  expect(wrapper.emitted('update:rotation')!.at(-1)).toEqual([122.75]);
});
it('rejects unfinished and invalid angles, and normalizes negative values', async () => {
  const wrapper = mount(MediaOrientationControls);
  const field = wrapper.findComponent({ name: 'Input' });
  for (const value of ['', ' ', 'bad', Infinity]) field.vm.$emit('update:modelValue', value);
  expect(wrapper.emitted('update:rotation')).toBeUndefined();
  field.vm.$emit('update:modelValue', -22.5);
  expect(wrapper.emitted('update:rotation')).toEqual([[337.5]]);
});
it('shows external undo changes instead of committing a stale angle draft', async () => {
  const wrapper = mount(MediaOrientationControls, { props: { rotation: 10 } });
  const field = wrapper.get('input');
  await field.setValue('50.25');
  await wrapper.setProps({ rotation: 15.125 });
  expect((field.element as HTMLInputElement).value).toBe('15.13');
  await field.trigger('blur');
  expect(wrapper.emitted('update:rotation')).toBeUndefined();
});

it('shows both mirror actions by default and deliberately hides them for text elements', async () => {
  const wrapper = mount(MediaOrientationControls);
  expect(wrapper.findAll('button')).toHaveLength(4);
  await wrapper.setProps({ showMirroring: false });
  expect(wrapper.findAll('button')).toHaveLength(2);
  expect(wrapper.find('input').exists()).toBe(true);
});
