import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import CanvasPanelLayout from '../CanvasPanelLayout.vue';
import RemoveBackgroundControl from '../RemoveBackgroundControl.vue';
import CanvasBackgroundTabs from '../CanvasBackgroundTabs.vue';
import WatermarkControls from '../WatermarkControls.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import { DEFAULT_WATERMARK } from '../../../canvas/output-canvas';
vi.mock('~/api/capture', () => ({ capture: {} }));
enableAutoUnmount(afterEach);
const create = (still = false) =>
  mount(CanvasPanelLayout, {
    props: { still, showBackground: true, activeKind: 'image', blurPercent: 12 },
    slots: { default: '<div class="media-scroll-grid">Real background slots</div>' },
  });
it('uses the real screenshot descriptions and background library slot', () => {
  const wrapper = create(true);
  expect(wrapper.findComponent(RemoveBackgroundControl).props('description')).toBeTruthy();
  expect(wrapper.findComponent(WatermarkControls).props('description')).toBeTruthy();
  expect(wrapper.get('.tab-content-panel .media-scroll-grid').text()).toBe('Real background slots');
  expect(wrapper.findComponent(CanvasBackgroundTabs).props('still')).toBe(true);
});
it('preserves video labels and emits every shared Canvas intent', () => {
  const wrapper = create();
  expect(wrapper.findComponent(RemoveBackgroundControl).props('description')).toBeUndefined();
  wrapper.findComponent(RemoveBackgroundControl).vm.$emit('update:modelValue', true);
  wrapper.findComponent(CanvasBackgroundTabs).vm.$emit('update:modelValue', 'gradient');
  wrapper.findComponent(BigSlider).vm.$emit('update:modelValue', 25);
  wrapper.findComponent(BigSlider).vm.$emit('interaction-end');
  wrapper.findComponent(WatermarkControls).vm.$emit('update:modelValue', DEFAULT_WATERMARK);
  expect(wrapper.emitted('update:showBackground')).toEqual([[false]]);
  expect(wrapper.emitted('update:activeKind')).toEqual([['gradient']]);
  expect(wrapper.emitted('update:blurPercent')).toEqual([[25]]);
  expect(wrapper.emitted('blur-interaction-end')).toEqual([[]]);
  expect(wrapper.emitted('update:watermark')).toEqual([[DEFAULT_WATERMARK]]);
});
it('hides background options without discarding their layout or watermark controls', async () => {
  const wrapper = create();
  await wrapper.setProps({ showBackground: false, blurPercent: 50 });
  expect(wrapper.get('.background-options').attributes('style')).toContain('display: none');
  expect(wrapper.findComponent(BigSlider).props('modelValue')).toBe(50);
  expect(wrapper.findComponent(WatermarkControls).exists()).toBe(true);
});
