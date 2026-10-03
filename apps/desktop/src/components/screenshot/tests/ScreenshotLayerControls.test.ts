import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import ScreenshotLayerControls from '../composition/ScreenshotLayerControls.vue';
import Select from '~/ui/select/Select.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import type { ScreenshotLayerControlsProps } from '../composition/screenshot-layer-controls-types';
vi.mock('~/api/capture', () => ({ capture: {} }));
enableAutoUnmount(afterEach);
const layer = { id: 'image', opacity: 80, blendMode: 'source-over' as const, locked: false };
it('shares real blend and opacity controls and forwards valid layer updates', () => {
  const wrapper = mount(ScreenshotLayerControls, { props: { layer } });
  expect(wrapper.findComponent(BigSlider).props('modelValue')).toBe(80);
  wrapper.findComponent(Select).vm.$emit('update:modelValue', 'multiply');
  wrapper.findComponent(BigSlider).vm.$emit('update:modelValue', 65);
  expect(wrapper.emitted('update')).toEqual([[{ blendMode: 'multiply' }], [{ opacity: 65 }]]);
});
it.each<ScreenshotLayerControlsProps>([
  { layer: undefined },
  { layer, disabled: true },
  { layer: { ...layer, locked: true } },
])('does not modify absent, busy or locked layers (%j)', (props) => {
  const wrapper = mount(ScreenshotLayerControls, { props });
  expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined();
  wrapper.findComponent(Select).vm.$emit('update:modelValue', 'multiply');
  wrapper.findComponent(BigSlider).vm.$emit('update:modelValue', 65);
  expect(wrapper.emitted('update')).toBeUndefined();
});
