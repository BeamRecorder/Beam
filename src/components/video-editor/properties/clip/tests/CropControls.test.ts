import { defineComponent, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { NormalizedCrop } from '~/media/shared/composition-types';
import type { SelectedClipProperties } from '../../properties-panel-types';
import { FULL_CROP } from '../../../composition/crop/crop-pixels';
import CropControls from '../CropControls.vue';

const BigSlider = defineComponent({
  name: 'BigSlider',
  props: {
    modelValue: { type: Number, required: true },
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    label: { type: String, required: true },
  },
  emits: ['update:modelValue', 'interaction-start', 'interaction-end', 'interaction-cancel'],
  template:
    '<button class="crop-slider" :data-label="label" :data-value="modelValue" :data-min="min" :data-max="max">slider</button>',
});

const Button = defineComponent({
  name: 'Button',
  inheritAttrs: false,
  emits: ['click'],
  template: '<button class="crop-reset" v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>',
});

const baseClip = (overrides: Partial<SelectedClipProperties> = {}): SelectedClipProperties => ({
  id: 'clip-1',
  kind: 'video',
  name: 'Demo',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  cropDimensions: { width: 100, height: 80 },
  ...overrides,
});

const mountControls = (overrides: Partial<SelectedClipProperties> = {}) =>
  mount(CropControls, {
    props: { clip: baseClip(overrides) },
    global: { stubs: { BigSlider, Button } },
  });

const sliderFor = (wrapper: VueWrapper, label: string) =>
  wrapper.findAllComponents(BigSlider).find((slider) => slider.props('label') === label)!;

const crop = (x: number, y: number, width: number, height: number): NormalizedCrop => ({ x, y, width, height });

const expectCropClose = (actual: NormalizedCrop | undefined, expected: NormalizedCrop) => {
  expect(actual).toBeDefined();
  if (!actual) return;
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
  expect(actual.width).toBeCloseTo(expected.width);
  expect(actual.height).toBeCloseTo(expected.height);
};

describe('CropControls', () => {
  it.each([null, undefined])(
    'shows an explicit unavailable state for missing source dimensions (%s)',
    (cropDimensions) => {
      const wrapper = mountControls({ cropDimensions });

      expect(wrapper.get('.crop-hint').text()).toBe('Source dimensions are unavailable.');
      expect(wrapper.findAllComponents(BigSlider)).toHaveLength(0);
      expect(wrapper.find('.crop-reset').exists()).toBe(false);
    },
  );

  it('renders source pixel dimensions and the maximum allowed value for every edge', () => {
    const wrapper = mountControls({ crop: crop(0.1, 0.25, 0.6, 0.5) });

    expect(wrapper.get('.crop-summary').text()).toContain('60 × 40 px');
    expect(wrapper.get('.crop-hint').text()).toBe('Source: 100 × 80 px · Values trim each edge.');
    expect(wrapper.findAllComponents(BigSlider).map((slider) => slider.props('label'))).toEqual([
      'Top',
      'Bottom',
      'Left',
      'Right',
    ]);

    expect(sliderFor(wrapper, 'Top').props()).toMatchObject({ modelValue: 20, min: 0, max: 59 });
    expect(sliderFor(wrapper, 'Bottom').props()).toMatchObject({ modelValue: 20, min: 0, max: 59 });
    expect(sliderFor(wrapper, 'Left').props()).toMatchObject({ modelValue: 10, min: 0, max: 69 });
    expect(sliderFor(wrapper, 'Right').props()).toMatchObject({ modelValue: 30, min: 0, max: 89 });
  });

  it('commits numeric edge edits immediately and resets to the full source', async () => {
    const wrapper = mountControls({ crop: crop(0.1, 0.25, 0.6, 0.5) });

    sliderFor(wrapper, 'Left').vm.$emit('update:modelValue', 50);
    await nextTick();

    expect(wrapper.emitted('update')).toEqual([[crop(0.5, 0.25, 0.2, 0.5)]]);
    expect(wrapper.emitted('preview')).toEqual([[null]]);

    expect(wrapper.get('.crop-reset').attributes('disabled')).toBeUndefined();
    await wrapper.get('.crop-reset').trigger('click');
    expect(wrapper.emitted('update')).toEqual([[crop(0.5, 0.25, 0.2, 0.5)], [FULL_CROP]]);
    expect(wrapper.emitted('preview')).toEqual([[null], [null]]);
  });

  it.each([
    ['missing crop and framing', undefined, undefined],
    ['full crop and custom framing', FULL_CROP, 'custom'],
  ] as const)('disables reset for a %s no-op', async (_name, currentCrop, cameraFramingPreset) => {
    const wrapper = mountControls({ crop: currentCrop, cameraFramingPreset });
    const reset = wrapper.get('.crop-reset');

    expect(reset.attributes('disabled')).toBeDefined();
    await reset.trigger('click');
    expect(wrapper.emitted('update')).toBeUndefined();
  });

  it('resets a non-custom framing preset even when its crop is full', async () => {
    const wrapper = mountControls({ cameraFramingPreset: 'square' });
    const reset = wrapper.get('.crop-reset');

    expect(reset.attributes('disabled')).toBeUndefined();
    await reset.trigger('click');
    expect(wrapper.emitted('update')).toEqual([[FULL_CROP]]);
    expect(wrapper.emitted('preview')).toEqual([[null]]);
  });

  it('does not create an update for direct or gesture no-ops', async () => {
    const wrapper = mountControls();
    const left = sliderFor(wrapper, 'Left');

    left.vm.$emit('update:modelValue', 0);
    await nextTick();
    expect(wrapper.emitted('update')).toBeUndefined();
    expect(wrapper.emitted('preview')).toBeUndefined();

    left.vm.$emit('interaction-start');
    left.vm.$emit('update:modelValue', 0);
    await nextTick();
    left.vm.$emit('interaction-end');
    await nextTick();

    expect(wrapper.emitted('update')).toBeUndefined();
    expect(wrapper.emitted('preview')).toEqual([[FULL_CROP], [null]]);
  });

  it('previews slider changes and commits only the latest value when the gesture ends', async () => {
    const wrapper = mountControls();
    const left = sliderFor(wrapper, 'Left');
    const first = crop(0.1, 0, 0.9, 1);
    const second = crop(0.2, 0, 0.8, 1);

    left.vm.$emit('interaction-start');
    left.vm.$emit('update:modelValue', 10);
    await nextTick();
    left.vm.$emit('update:modelValue', 20);
    await nextTick();

    expect(wrapper.emitted('update')).toBeUndefined();
    expect(wrapper.emitted('preview')).toEqual([[first], [second]]);

    left.vm.$emit('interaction-end');
    await nextTick();
    expect(wrapper.emitted('update')).toEqual([[second]]);
    expect(wrapper.emitted('preview')).toEqual([[first], [second], [null]]);

    left.vm.$emit('interaction-end');
    expect(wrapper.emitted('update')).toEqual([[second]]);
  });

  it('maps displayed edge edits back through horizontal and vertical mirrors', async () => {
    const initial = crop(0.1, 0.2, 0.5, 0.4);
    const wrapper = mountControls({ crop: initial, isMirrored: true, isMirroredY: true });

    expect(sliderFor(wrapper, 'Left').props('modelValue')).toBe(40);
    expect(sliderFor(wrapper, 'Right').props('modelValue')).toBe(10);
    expect(sliderFor(wrapper, 'Top').props('modelValue')).toBe(32);
    expect(sliderFor(wrapper, 'Bottom').props('modelValue')).toBe(16);

    sliderFor(wrapper, 'Left').vm.$emit('update:modelValue', 50);
    await nextTick();
    sliderFor(wrapper, 'Top').vm.$emit('update:modelValue', 40);
    await nextTick();

    const updates = wrapper.emitted('update') as Array<[NormalizedCrop]>;
    expect(updates).toHaveLength(2);
    expectCropClose(updates[0]?.[0], crop(0.1, 0.2, 0.4, 0.4));
    expectCropClose(updates[1]?.[0], crop(0.1, 0.2, 0.5, 0.3));
  });

  it('cancels a stale preview when history changes the crop or clip identity', async () => {
    const wrapper = mountControls();
    const left = sliderFor(wrapper, 'Left');

    left.vm.$emit('interaction-start');
    left.vm.$emit('update:modelValue', 10);
    await nextTick();
    await wrapper.setProps({ clip: baseClip({ crop: crop(0.4, 0, 0.6, 1) }) });

    expect(wrapper.emitted('preview')).toEqual([[crop(0.1, 0, 0.9, 1)], [null]]);
    left.vm.$emit('update:modelValue', 20);
    await nextTick();
    expect(wrapper.emitted('update')).toBeUndefined();
    left.vm.$emit('interaction-end');
    expect(wrapper.emitted('update')).toBeUndefined();

    const second = mountControls();
    const secondLeft = sliderFor(second, 'Left');
    secondLeft.vm.$emit('interaction-start');
    secondLeft.vm.$emit('update:modelValue', 10);
    await nextTick();
    await second.setProps({ clip: baseClip({ id: 'clip-2' }) });

    expect(second.emitted('preview')).toEqual([[crop(0.1, 0, 0.9, 1)], [null]]);
    second.unmount();
  });

  it('does not commit a crop after an interaction is cancelled, even for late values', async () => {
    const wrapper = mountControls();
    const left = sliderFor(wrapper, 'Left');
    const first = crop(0.1, 0, 0.9, 1);

    left.vm.$emit('interaction-start');
    left.vm.$emit('update:modelValue', 10);
    await nextTick();
    left.vm.$emit('interaction-cancel');
    await nextTick();
    left.vm.$emit('update:modelValue', 20);
    await nextTick();
    left.vm.$emit('interaction-end');
    await nextTick();

    expect(wrapper.emitted('update')).toBeUndefined();
    expect(wrapper.emitted('preview')).toEqual([[first], [null], [null]]);
  });

  it('does not discard a draft when the external crop already matches it and cancels on unmount', async () => {
    const wrapper = mountControls();
    const left = sliderFor(wrapper, 'Left');
    const draft = crop(0.1, 0, 0.9, 1);

    left.vm.$emit('interaction-start');
    left.vm.$emit('update:modelValue', 10);
    await nextTick();
    expect(wrapper.emitted('preview')).toEqual([[draft]]);
    await wrapper.setProps({ clip: baseClip({ crop: draft }) });
    expect(wrapper.emitted('preview')).toEqual([[draft]]);

    wrapper.unmount();
    expect(wrapper.emitted('preview')).toContainEqual([null]);
  });
});
