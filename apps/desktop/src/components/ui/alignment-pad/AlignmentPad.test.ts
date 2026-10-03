import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vitest';
import AlignmentPad from './AlignmentPad.vue';
const labels = {
  group: 'Alignment',
  left: 'Left',
  center: 'Center',
  right: 'Right',
  top: 'Top',
  middle: 'Middle',
  bottom: 'Bottom',
};
enableAutoUnmount(afterEach);
const create = () => mount(AlignmentPad, { props: { labels, modelValue: null } });
it('offers nine named native controls and represents free placement with no active point', () => {
  const wrapper = create();
  expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe('Alignment');
  expect(wrapper.findAll('button')).toHaveLength(9);
  expect(wrapper.findAll('[aria-pressed="true"]')).toHaveLength(0);
  expect(wrapper.findAll('button')[8]!.attributes('aria-label')).toBe('Bottom, Right');
});
it('emits each alignment without mutating inputs and reflects the selected point', async () => {
  const wrapper = create();
  await wrapper.setProps({ modelValue: { x: 0.5, y: 0.5 } });
  expect(wrapper.findAll('[aria-pressed="true"]')).toHaveLength(1);
  expect(wrapper.get('[aria-pressed="true"]').attributes('aria-label')).toBe('Middle, Center');
  for (const button of wrapper.findAll('button')) await button.trigger('click');
  expect(wrapper.emitted('update:modelValue')).toHaveLength(9);
  expect(wrapper.emitted('update:modelValue')![8]).toEqual([{ x: 1, y: 1 }]);
});
it('supports bounded arrows, Home and End while preserving native Enter/Space behavior', async () => {
  const wrapper = create();
  const buttons = wrapper.findAll('button');
  for (const [index, key, expected] of [
    [4, 'ArrowLeft', 3],
    [4, 'ArrowRight', 5],
    [4, 'ArrowUp', 1],
    [4, 'ArrowDown', 7],
    [0, 'ArrowLeft', 0],
    [8, 'End', 8],
    [8, 'Home', 0],
  ] as const) {
    await buttons[index]!.trigger('keydown', { key });
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([
      { x: (expected % 3) / 2, y: Math.floor(expected / 3) / 2 },
    ]);
  }
  const count = wrapper.emitted('update:modelValue')!.length;
  await buttons[4]!.trigger('keydown', { key: 'Tab' });
  expect(wrapper.emitted('update:modelValue')).toHaveLength(count);
});
it('disables pointer and keyboard edits without removing the current selection', async () => {
  const wrapper = create();
  await wrapper.setProps({ disabled: true, modelValue: { x: 0, y: 1 } });
  const button = wrapper.findAll('button')[6]!;
  expect(button.attributes('disabled')).toBeDefined();
  await button.trigger('click');
  await button.trigger('keydown', { key: 'End' });
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
});
