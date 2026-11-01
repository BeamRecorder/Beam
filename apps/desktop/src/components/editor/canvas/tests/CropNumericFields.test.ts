import { afterEach, expect, it } from 'vitest';
import { mount, enableAutoUnmount } from '@vue/test-utils';
import CropNumericFields from '../CropNumericFields.vue';
import Input from '~/ui/input/Input.vue';
import { cropPixels } from '@beam/engine/layout/crop/crop-pixels';
import type { NormalizedCrop } from '@beam/engine/shared/composition-types';

enableAutoUnmount(afterEach);
const create = () =>
  mount(CropNumericFields, {
    props: { measurements: { top: 8, bottom: 16, left: 10, right: 20, width: 70, height: 56 } },
  });
it('shows all four trims and retained dimensions, preserving typed drafts until commit', async () => {
  const wrapper = create();
  for (const name of ['Top', 'Bottom', 'Left', 'Right', 'Width', 'Height'])
    expect(wrapper.find(`input[aria-label="${name}"]`).exists()).toBe(true);
  await wrapper.get('input[aria-label="Left"]').setValue('15');
  expect(wrapper.emitted('update')).toBeUndefined();
  await wrapper.get('input[aria-label="Left"]').trigger('blur');
  const crop = wrapper.emitted('update')![0]![0] as NormalizedCrop;
  expect(cropPixels(crop, { width: 100, height: 80 }).left).toBe(15);
});
it('switches every field between px and percent without editing the crop', async () => {
  const wrapper = create();
  wrapper.findComponent(Input).vm.$emit('update:unit', '%');
  await wrapper.vm.$nextTick();
  expect(wrapper.findAllComponents(Input).map((input) => input.props('unit'))).toEqual(new Array(6).fill('%'));
  expect(wrapper.emitted('update')).toBeUndefined();
  wrapper.findAllComponents(Input)[2]!.vm.$emit('update:modelValue', 25);
  const crop = wrapper.emitted('update')![0]![0] as NormalizedCrop;
  expect(cropPixels(crop, { width: 100, height: 80 }).left).toBe(25);
  wrapper.findComponent(Input).vm.$emit('update:unit', 'px');
  await wrapper.vm.$nextTick();
  expect(wrapper.findComponent(Input).props('unit')).toBe('px');
});
it('clamps retained dimensions and leaves invalid or unchanged inputs alone', async () => {
  const wrapper = create();
  const fields = wrapper.findAllComponents(Input);
  fields[0]!.vm.$emit('update:modelValue', '');
  fields[2]!.vm.$emit('update:modelValue', 10);
  expect(wrapper.emitted('update')).toBeUndefined();
  fields[4]!.vm.$emit('update:modelValue', 9999);
  const crop = wrapper.emitted('update')![0]![0] as NormalizedCrop;
  expect(cropPixels(crop, { width: 100, height: 80 })).toMatchObject({ left: 10, right: 0, width: 90 });
});
it('flushes a pending draft before confirmation without requiring blur or Enter', async () => {
  const wrapper = create();
  await wrapper.get('input[aria-label="Left"]').setValue('23');
  expect(wrapper.emitted('update')).toBeUndefined();
  wrapper.vm.flush();
  expect(wrapper.emitted('update')).toHaveLength(1);
  const crop = wrapper.emitted('update')![0]![0] as NormalizedCrop;
  expect(cropPixels(crop, { width: 100, height: 80 }).left).toBe(23);
  wrapper.vm.flush();
  expect(wrapper.emitted('update')).toHaveLength(1);
});
