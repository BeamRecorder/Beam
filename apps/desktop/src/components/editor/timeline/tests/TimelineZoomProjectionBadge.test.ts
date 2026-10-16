import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import TimelineZoomProjectionBadge from '../TimelineZoomProjectionBadge.vue';
import ZoomTiltPreview from '../../zoom/ZoomTiltPreview.vue';
import { ORBIT_PRESETS, applyOrbitPreset } from '@beam/engine/zoom/orbit-settings';
import { applyZoomTiltPreset, ZOOM_TILT_PRESETS } from '@beam/engine/zoom/zoom-tilt-presets';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';

enableAutoUnmount(afterEach);
const zoom: ZoomElement = {
  id: 'zoom',
  sessionId: 'session',
  startMs: 0,
  endMs: 1000,
  mode: 'manual',
  depth: 2,
  focus: { cx: 0.5, cy: 0.5 },
};

describe('timeline perspective thumbnail', () => {
  it('keeps the 2D label for flat and legacy zooms', async () => {
    const wrapper = mount(TimelineZoomProjectionBadge, { props: { zoom } });
    expect(wrapper.text()).toBe('2D');
    expect(wrapper.find('svg').exists()).toBe(false);
    await wrapper.setProps({ zoom: { ...zoom, projection: '2d' } });
    expect(wrapper.text()).toBe('2D');
  });

  it.each(ZOOM_TILT_PRESETS)('shows the $id perspective instead of the 3D label', (preset) => {
    const wrapper = mount(TimelineZoomProjectionBadge, {
      props: { zoom: applyZoomTiltPreset(zoom, preset) },
    });
    expect(wrapper.text()).toBe('');
    expect(wrapper.getComponent(ZoomTiltPreview).props('preset')).toEqual({
      intensity: preset.intensity,
      horizontal: preset.horizontal,
      vertical: preset.vertical,
    });
    expect(wrapper.get('svg').classes()).toContain('compact');
    expect(wrapper.attributes('title')).not.toBe('Custom');
    expect(wrapper.attributes('aria-label')).toBe(wrapper.attributes('title'));
  });

  it('renders the actual Custom controls and refreshes after edits and history changes', async () => {
    const value: ZoomElement = {
      ...zoom,
      projection: '3d',
      tiltPreset: 'custom',
      tiltIntensity: 0.9,
      tiltHorizontal: -0.2,
      tiltVertical: 0.7,
    };
    const wrapper = mount(TimelineZoomProjectionBadge, {
      props: { zoom: value },
    });
    const path = wrapper.get('path.outline').attributes('d');
    expect(wrapper.attributes('title')).toBe('Custom');
    expect(wrapper.getComponent(ZoomTiltPreview).props('preset')).toEqual({
      intensity: 0.9,
      horizontal: -0.2,
      vertical: 0.7,
    });
    await wrapper.setProps({
      zoom: applyZoomTiltPreset(zoom, ZOOM_TILT_PRESETS[2]!),
    });
    expect(wrapper.get('path.outline').attributes('d')).not.toBe(path);
    expect(wrapper.attributes('title')).toBe('Tilt left');
    await wrapper.setProps({ zoom: value });
    expect(wrapper.get('path.outline').attributes('d')).toBe(path);
  });
});

it.each(ORBIT_PRESETS)('shows the actual $id camera including pullback and roll', (preset) => {
  const wrapper = mount(TimelineZoomProjectionBadge, { props: { zoom: applyOrbitPreset(zoom, preset) } });
  expect(wrapper.getComponent(ZoomTiltPreview).props('orbit')).toEqual(preset.settings);
  expect(wrapper.attributes('title')).not.toBe('2D');
  expect(wrapper.attributes('title')).not.toBe('Custom');
});
it('updates a camera badge after custom editing, undo and missing optional settings', async () => {
  const original = applyOrbitPreset(zoom, ORBIT_PRESETS[7]!);
  const wrapper = mount(TimelineZoomProjectionBadge, { props: { zoom: original } });
  const path = wrapper.get('path.screen').attributes('d');
  await wrapper.setProps({ zoom: { ...original, orbitSettings: { ...original.orbitSettings!, roll: 5 } } });
  expect(wrapper.attributes('title')).toBe('Custom');
  expect(wrapper.get('path.screen').attributes('d')).not.toBe(path);
  await wrapper.setProps({ zoom: original });
  expect(wrapper.get('path.screen').attributes('d')).toBe(path);
  await wrapper.setProps({ zoom: { ...zoom, projection: 'orbit' } });
  expect(wrapper.attributes('title')).toBe('Balanced');
});
