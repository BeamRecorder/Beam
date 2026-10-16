import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { SUPPORTED_LOCALES } from '~/i18n/locales';
import { i18n, setCurrentLocale } from '~/i18n';
import BigSlider from '~/ui/slider/BigSlider.vue';
import AdvancedButton from '~/ui/button/AdvancedButton.vue';
import ZoomTiltControls from '../ZoomTiltControls.vue';
import ZoomTiltPreview from '../../../zoom/ZoomTiltPreview.vue';
import { DEFAULT_ORBIT_SETTINGS, ORBIT_PRESETS } from '@beam/engine/zoom/orbit-settings';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';

enableAutoUnmount(afterEach);
afterEach(() => setCurrentLocale('en'));
const zoom: ZoomElement = {
  id: 'zoom',
  sessionId: 'take',
  startMs: 0,
  endMs: 1000,
  depth: 2,
  focus: { cx: 0.5, cy: 0.5 },
  mode: 'auto',
  projection: 'orbit',
  tiltIntensity: 1,
  orbitSettings: { ...DEFAULT_ORBIT_SETTINGS },
};
const controls = (value = zoom) => mount(ZoomTiltControls, { props: { zoom: value } });
it('groups eight illustrated, named presets without exposing advanced controls initially', () => {
  const wrapper = controls();
  expect(wrapper.findAll('[data-tilt-preset]')).toHaveLength(8);
  expect(wrapper.findAllComponents(ZoomTiltPreview)).toHaveLength(8);
  expect(wrapper.findAllComponents(BigSlider)).toHaveLength(0);
  expect(wrapper.get('[data-tilt-preset="balanced"]').attributes('aria-pressed')).toBe('true');
  expect(wrapper.get('[data-tilt-preset="pullback-large"]').text()).toContain('Large pullback');
  expect(new Set(wrapper.findAll('path.screen').map((p) => p.attributes('d'))).size).toBe(8);
});
it.each(ORBIT_PRESETS)('selects $id with independent owned camera settings', async (preset) => {
  const wrapper = controls();
  await wrapper.get('.custom-tilt').trigger('click');
  await wrapper.get(`[data-tilt-preset="${preset.id}"]`).trigger('click');
  const emitted = wrapper.emitted('update')!.at(-1)![0] as ZoomElement;
  expect(emitted).toMatchObject({
    projection: 'orbit',
    transition: 'cinematic',
    tiltIntensity: 1,
    orbitSettings: preset.settings,
    focus: zoom.focus,
  });
  expect(emitted.orbitSettings).not.toBe(preset.settings);
  await wrapper.setProps({ zoom: emitted });
  expect(wrapper.findAllComponents(BigSlider)).toHaveLength(0);
  expect(wrapper.get(`[data-tilt-preset="${preset.id}"]`).attributes('aria-pressed')).toBe('true');
});
it('opens and closes advanced controls without changing the saved zoom', async () => {
  const wrapper = controls();
  await wrapper.getComponent(AdvancedButton).get('button').trigger('click');
  expect(wrapper.findAllComponents(BigSlider)).toHaveLength(11);
  expect(wrapper.emitted('update')).toBeUndefined();
  await wrapper.get('.custom-tilt').trigger('click');
  expect(wrapper.findAllComponents(BigSlider)).toHaveLength(0);
});
it('hides movement-only controls for still or manual camera views', async () => {
  const wrapper = controls({ ...zoom, mode: 'manual' });
  await wrapper.get('.custom-tilt').trigger('click');
  expect(wrapper.findAllComponents(BigSlider)).toHaveLength(7);
  for (const key of ['horizontal', 'vertical', 'responseMs', 'leadMs'])
    expect(wrapper.find(`[data-camera-field="${key}"]`).exists()).toBe(false);
  expect(wrapper.find('[data-camera-field="pullback"]').exists()).toBe(true);
});
it('edits angle, percentage and timing controls in their proper units and marks the result custom', async () => {
  const wrapper = controls();
  await wrapper.get('.custom-tilt').trigger('click');
  for (const [key, input, expected, suffix] of [
    ['yaw', -25, -25, '°'],
    ['pullback', 45, 0.45, '%'],
    ['responseMs', 850, 850, ' ms'],
  ] as const) {
    const slider = wrapper.findAllComponents(BigSlider).find((s) => s.attributes('data-camera-field') === key)!;
    slider.vm.$emit('update:modelValue', input);
    const emitted = wrapper.emitted('update')!.at(-1)![0] as ZoomElement;
    expect(emitted.orbitSettings![key]).toBe(expected);
    expect(emitted.orbitSettings!.fieldOfView).toBe(35);
    expect((slider.props('formatValue') as (v: number) => string)(input)).toBe(`${input}${suffix}`);
    await wrapper.setProps({ zoom: emitted });
    expect(wrapper.get('.custom-tilt').attributes('aria-pressed')).toBe('true');
  }
});
it.each([-200, 42, 200])('bounds camera intensity at %s', async (value) => {
  const wrapper = controls();
  await wrapper.get('.custom-tilt').trigger('click');
  const slider = wrapper.findAllComponents(BigSlider)[0]!;
  slider.vm.$emit('update:modelValue', value);
  expect((wrapper.emitted('update')!.at(-1)![0] as ZoomElement).tiltIntensity).toBe(
    Math.max(0, Math.min(1, value / 100)),
  );
  expect((slider.props('formatValue') as (v: number) => string)(42)).toBe('42%');
});
it('bounds oversized edits and resets disclosure when changing selected zooms', async () => {
  const wrapper = controls({ ...zoom, orbitSettings: { ...DEFAULT_ORBIT_SETTINGS, yaw: 3 } });
  expect(wrapper.findAllComponents(BigSlider)).toHaveLength(11);
  wrapper
    .findAllComponents(BigSlider)
    .find((s) => s.attributes('data-camera-field') === 'pullback')!
    .vm.$emit('update:modelValue', 1000);
  expect((wrapper.emitted('update')!.at(-1)![0] as ZoomElement).orbitSettings!.pullback).toBe(0.65);
  await wrapper.setProps({ zoom: { ...zoom, id: 'another' } });
  expect(wrapper.findAllComponents(BigSlider)).toHaveLength(0);
});
it('preserves legacy camera rendering until an explicit edit and respects locked zooms', async () => {
  const wrapper = controls({ ...zoom, projection: '3d', tiltHorizontal: -0.5, tiltVertical: 0.25 });
  expect(wrapper.emitted('update')).toBeUndefined();
  await wrapper.get('.custom-tilt').trigger('click');
  const yaw = wrapper.findAllComponents(BigSlider).find((s) => s.attributes('data-camera-field') === 'yaw')!;
  expect(yaw.props('modelValue')).toBe(-11);
  yaw.vm.$emit('update:modelValue', -18);
  expect((wrapper.emitted('update')!.at(-1)![0] as ZoomElement).projection).toBe('orbit');
  await wrapper.setProps({ zoom: { ...zoom, locked: true } });
  await wrapper.get('[data-tilt-preset="dynamic"]').trigger('click');
  yaw.vm.$emit('update:modelValue', 20);
  expect(wrapper.emitted('update')).toHaveLength(1);
});
it('keeps independent accessible disclosures for multiple inspectors', () => {
  const host = mount(
    defineComponent({ setup: () => () => [h(ZoomTiltControls, { zoom }), h(ZoomTiltControls, { zoom })] }),
  );
  const ids = host.findAllComponents(AdvancedButton).map((w) => w.props('controls'));
  expect(new Set(ids).size).toBe(2);
});
it.each(SUPPORTED_LOCALES)('translates the presets and every advanced control in %s', async (locale) => {
  await setCurrentLocale(locale);
  const wrapper = controls();
  for (const preset of ORBIT_PRESETS) {
    expect(i18n.global.te(`ZoomPanel.${preset.labelKey}`, locale)).toBe(true);
    expect(wrapper.get(`[data-tilt-preset="${preset.id}"]`).text()).toContain(
      i18n.global.t(`ZoomPanel.${preset.labelKey}`),
    );
  }
  await wrapper.get('.custom-tilt').trigger('click');
  expect(
    wrapper
      .findAllComponents(BigSlider)
      .every((slider) => !!slider.props('label') && !slider.props('label').startsWith('ZoomPanel.')),
  ).toBe(true);
});
