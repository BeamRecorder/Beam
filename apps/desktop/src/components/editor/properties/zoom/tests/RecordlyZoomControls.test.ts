import { afterEach, expect, it } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import RecordlyZoomControls from '../RecordlyZoomControls.vue';
import RecordlyBlurControls from '../RecordlyBlurControls.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Switch from '~/ui/switch/Switch.vue';
import { DEFAULT_ZOOM_AUTO_FOLLOW } from '@beam/engine/zoom/zoom-types';
import type { ZoomAutoFollowSettings } from '@beam/engine/zoom/zoom-types';
import { normalizeRecordlyZoom, applyRecordlyZoomPreset } from '@beam/engine/zoom/recordly-settings';
import { RECORDLY_CONTROLS, RECORDLY_BLUR_CONTROLS } from '../recordly-controls';

enableAutoUnmount(afterEach);
const value = () => ({
  ...DEFAULT_ZOOM_AUTO_FOLLOW,
  experimentalZoom: true,
  zoomBackground: false,
  recordly: normalizeRecordlyZoom({}),
});
it.each(['focused', 'smooth'] as const)(
  'selects %s without changing background/follow/other advanced settings',
  async (id) => {
    const input = value(),
      wrapper = mount(RecordlyZoomControls, { props: { modelValue: input } });
    await wrapper.get(`[data-recordly-preset="${id}"]`).trigger('click');
    const updated = wrapper.emitted('update:modelValue')!.at(-1)![0] as ZoomAutoFollowSettings;
    expect(updated).toEqual({ ...input, recordly: applyRecordlyZoomPreset(input.recordly, id) });
    expect(input).toEqual(value());
    await wrapper.setProps({ modelValue: updated });
    expect(wrapper.get(`[data-recordly-preset="${id}"]`).classes().join(' ')).toContain('selected');
  },
);
it('edits all actual camera controls and retains settings when connections are hidden', async () => {
  const input = value(),
    wrapper = mount(RecordlyZoomControls, { props: { modelValue: input } });
  expect(wrapper.findAllComponents(BigSlider)).toHaveLength(0);
  await wrapper.get('[aria-controls="recordly-zoom-advanced"]').trigger('click');
  const sliders = wrapper.findAllComponents(BigSlider);
  expect(sliders).toHaveLength(RECORDLY_CONTROLS.length + 2);
  for (const [i, control] of RECORDLY_CONTROLS.entries()) {
    sliders[i + 2]!.vm.$emit('update:modelValue', control.min);
    const updated = wrapper.emitted('update:modelValue')!.at(-1)![0] as ZoomAutoFollowSettings;
    expect(updated.recordly?.[control.key]).toBe(control.min);
    expect(updated.zoomBackground).toBe(false);
  }
  sliders[0]!.vm.$emit('update:modelValue', 500);
  expect(
    (wrapper.emitted('update:modelValue')!.at(-1)![0] as ZoomAutoFollowSettings).recordly?.connectedZoomGapMs,
  ).toBe(500);
  sliders[1]!.vm.$emit('update:modelValue', 900);
  expect(
    (wrapper.emitted('update:modelValue')!.at(-1)![0] as ZoomAutoFollowSettings).recordly?.connectedZoomDurationMs,
  ).toBe(900);
  wrapper.findAllComponents(Switch)[0]!.vm.$emit('update:modelValue', true);
  expect((wrapper.emitted('update:modelValue')!.at(-1)![0] as ZoomAutoFollowSettings).recordly?.zoomClassicMode).toBe(
    true,
  );
  wrapper.findAllComponents(Switch)[1]!.vm.$emit('update:modelValue', false);
  const updated = wrapper.emitted('update:modelValue')!.at(-1)![0] as ZoomAutoFollowSettings;
  await wrapper.setProps({ modelValue: updated });
  expect(wrapper.findAllComponents(BigSlider)).toHaveLength(RECORDLY_CONTROLS.length);
  expect(updated.recordly?.connectedZoomGapMs).toBe(1500);
});
it('shows custom animation without falsely selecting either preset', () => {
  const wrapper = mount(RecordlyZoomControls, {
    props: { modelValue: { ...value(), recordly: normalizeRecordlyZoom({ zoomInDurationMs: 400 }) } },
  });
  for (const button of wrapper.findAll('[data-recordly-preset]'))
    expect(button.classes().join(' ')).not.toContain('selected');
});
it('edits spatial filter tuning without modifying the other camera fields', async () => {
  const input = value(),
    wrapper = mount(RecordlyBlurControls, { props: { modelValue: input } });
  expect(wrapper.findAllComponents(BigSlider)).toHaveLength(0);
  await wrapper.get('[aria-controls="recordly-blur-advanced"]').trigger('click');
  const sliders = wrapper.findAllComponents(BigSlider);
  expect(sliders).toHaveLength(RECORDLY_BLUR_CONTROLS.length);
  for (const [i, control] of RECORDLY_BLUR_CONTROLS.entries()) {
    sliders[i]!.vm.$emit('update:modelValue', control.max);
    const updated = wrapper.emitted('update:modelValue')!.at(-1)![0] as ZoomAutoFollowSettings;
    expect(updated.recordly).toEqual({
      ...input.recordly,
      zoomMotionBlurTuning: { ...input.recordly.zoomMotionBlurTuning, [control.key]: control.max },
    });
  }
  expect(input).toEqual(value());
});
