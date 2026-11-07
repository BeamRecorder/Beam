import { afterEach, expect, it } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import ZoomAutoFollowControls from '../ZoomAutoFollowControls.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Switch from '~/ui/switch/Switch.vue';
import { DEFAULT_ZOOM_AUTO_FOLLOW, ZOOM_AUTO_FOLLOW_PRESETS } from '@beam/engine/zoom/zoom-types';
import type { ZoomAutoFollowSettings } from '@beam/engine/zoom/zoom-types';

enableAutoUnmount(afterEach);
const create = (value: ZoomAutoFollowSettings = { ...DEFAULT_ZOOM_AUTO_FOLLOW }) =>
  mount(ZoomAutoFollowControls, { props: { modelValue: value } });

it('keeps follow enabled for a legacy project and explains the fixed framing option', () => {
  const wrapper = create({ safeZone: 0.5, responsiveness: 0.55, directionLock: true });
  expect(wrapper.get('[role="switch"][aria-label="Follow cursor"]').attributes('aria-checked')).toBe('true');
  expect(wrapper.text()).toContain('clicked area');
  expect(wrapper.text()).toContain('Stable');
});
it('turns follow off without losing tuning and hides tracking-only controls', async () => {
  const value = { ...DEFAULT_ZOOM_AUTO_FOLLOW, safeZone: 0.62, responsiveness: 0.27, directionLock: false };
  const wrapper = create(value);
  await wrapper.get('[aria-controls="zoom-auto-follow-advanced-panel"]').trigger('click');
  expect(wrapper.find('#zoom-auto-follow-advanced-panel').exists()).toBe(true);
  await wrapper.get('[role="switch"][aria-label="Follow cursor"]').trigger('click');
  const disabled = wrapper.emitted('update:modelValue')!.at(-1)![0] as ZoomAutoFollowSettings;
  expect(disabled).toEqual({ ...value, enabled: false });
  await wrapper.setProps({ modelValue: disabled });
  expect(wrapper.find('[data-auto-follow-preset]').exists()).toBe(false);
  expect(wrapper.find('[aria-controls="zoom-auto-follow-advanced-panel"]').exists()).toBe(false);
  expect(wrapper.find('#zoom-auto-follow-advanced-panel').exists()).toBe(false);
  await wrapper.get('[role="switch"][aria-label="Follow cursor"]').trigger('click');
  expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([{ ...value, enabled: true }]);
});
it.each(['stable', 'balanced', 'responsive'] as const)('selects the %s follow tuning explicitly', async (preset) => {
  const wrapper = create({ ...DEFAULT_ZOOM_AUTO_FOLLOW, safeZone: 0.43 });
  await wrapper.get(`[data-auto-follow-preset="${preset}"]`).trigger('click');
  expect(wrapper.emitted('update:modelValue')).toEqual([[ZOOM_AUTO_FOLLOW_PRESETS[preset]]]);
});
it('retains the toggle while advanced sliders and direction lock change', async () => {
  const wrapper = create();
  await wrapper.get('[aria-controls="zoom-auto-follow-advanced-panel"]').trigger('click');
  wrapper.findAllComponents(BigSlider)[0]!.vm.$emit('update:modelValue', 61);
  wrapper.findAllComponents(BigSlider)[1]!.vm.$emit('update:modelValue', 24);
  wrapper.findAllComponents(Switch)[1]!.vm.$emit('update:modelValue', false);
  expect(wrapper.emitted('update:modelValue')).toEqual([
    [{ ...DEFAULT_ZOOM_AUTO_FOLLOW, safeZone: 0.61 }],
    [{ ...DEFAULT_ZOOM_AUTO_FOLLOW, responsiveness: 0.24 }],
    [{ ...DEFAULT_ZOOM_AUTO_FOLLOW, directionLock: false }],
  ]);
});
