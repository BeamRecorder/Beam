import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import TimelineZoomProjectionBadge from '../TimelineZoomProjectionBadge.vue';
import ZoomTiltPreview from '../../zoom/ZoomTiltPreview.vue';
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
    const wrapper = mount(TimelineZoomProjectionBadge, { props: { zoom: applyZoomTiltPreset(zoom, preset) } });
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
    const wrapper = mount(TimelineZoomProjectionBadge, { props: { zoom: value } });
    const path = wrapper.get('path.outline').attributes('d');
    expect(wrapper.attributes('title')).toBe('Custom');
    expect(wrapper.getComponent(ZoomTiltPreview).props('preset')).toEqual({
      intensity: 0.9,
      horizontal: -0.2,
      vertical: 0.7,
    });
    await wrapper.setProps({ zoom: applyZoomTiltPreset(zoom, ZOOM_TILT_PRESETS[2]!) });
    expect(wrapper.get('path.outline').attributes('d')).not.toBe(path);
    expect(wrapper.attributes('title')).toBe('Tilt left');
    await wrapper.setProps({ zoom: value });
    expect(wrapper.get('path.outline').attributes('d')).toBe(path);
  });
});
