import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ZoomPanel from '../ZoomPanel.vue';
import type { ZoomAutoFollowSettings, ZoomElement } from '../../../zoom/zoom-types';

const Button = {
  inheritAttrs: true,
  props: ['disabled', 'iconOnly', 'icon', 'tooltip'],
  emits: ['click'],
  template:
    '<button v-bind="$attrs" :disabled="disabled" :title="tooltip || undefined" :data-icon-only="iconOnly ? \'true\' : undefined" :data-icon="icon ? \'lucide\' : undefined" @click="$emit(\'click\')"><slot /></button>',
};
const ButtonGroup = { template: '<div class="button-group"><slot /></div>' };
const BigSlider = {
  props: ['label'],
  emits: ['update:modelValue'],
  template:
    "<button :class=\"label?.toLowerCase().includes('motion') ? 'motion-blur-slider' : label?.toLowerCase().includes('safe') ? 'auto-follow-safe-zone-slider' : label?.toLowerCase().includes('response') || label?.toLowerCase().includes('responsiveness') || label?.toLowerCase().includes('smooth') ? 'auto-follow-response-slider' : label?.toLowerCase().includes('left') ? 'tilt-horizontal-slider' : label?.toLowerCase().includes('up') ? 'tilt-vertical-slider' : label?.toLowerCase().includes('tilt') ? 'tilt-slider' : 'depth-slider'\" @click=\"$emit('update:modelValue', label?.toLowerCase().includes('motion') ? 80 : label?.toLowerCase().includes('safe') ? 80 : label?.toLowerCase().includes('response') || label?.toLowerCase().includes('responsiveness') || label?.toLowerCase().includes('smooth') ? 320 : label?.toLowerCase().includes('left') ? 25 : label?.toLowerCase().includes('up') ? -60 : label?.toLowerCase().includes('tilt') ? 180 : 4)\">Slider</button>",
};
const Switch = {
  inheritAttrs: true,
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    "<button :class=\"$attrs['aria-label']?.toLowerCase().includes('straight') ? 'auto-follow-direction-lock-switch' : 'motion-blur-switch'\" @click=\"$emit('update:modelValue', !modelValue)\">Switch</button>",
};

const selectedZoom: ZoomElement = {
  id: 'zoom-1',
  sessionId: 'session-1',
  startMs: 0,
  endMs: 1000,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 2,
  mode: 'auto',
};

const balancedAutoFollow: ZoomAutoFollowSettings = { safeZone: 0.5, responsiveness: 0.55, directionLock: true };

describe('ZoomPanel', () => {
  it('shows the empty state and generates automatic zooms', async () => {
    const wrapper = mount(ZoomPanel, {
      props: {
        selectedZoom: null,
        canGenerate: true,
        hasAutomaticZooms: false,
        motionBlur: { enabled: true, intensity: 0.55 },
      },
      global: { stubs: { Button, ButtonGroup, BigSlider, Switch } },
    });
    expect(wrapper.find('.empty-state').exists()).toBe(true);
    await wrapper.get('.header-action button').trigger('click');
    expect(wrapper.emitted('generate')).toHaveLength(1);
  });

  it('updates modes and depth, including the clamped slider range', async () => {
    const wrapper = mount(ZoomPanel, {
      props: {
        selectedZoom,
        canGenerate: true,
        hasAutomaticZooms: false,
        motionBlur: { enabled: true, intensity: 0.55 },
      },
      global: { stubs: { Button, ButtonGroup, BigSlider, Switch } },
    });
    await wrapper.get('.depth-slider').trigger('click');
    await wrapper.get('.preset-pill').trigger('click');
    await wrapper.findAll('.zoom-mode-options button')[1]!.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ ...selectedZoom, depth: 4 }]);
    expect(wrapper.emitted('update')).toContainEqual([{ ...selectedZoom, depth: 1 }]);
    expect(wrapper.emitted('update')).toContainEqual([{ ...selectedZoom, mode: 'manual' }]);
  });

  it('offers a confirmation before regenerating existing automatic zooms', async () => {
    const wrapper = mount(ZoomPanel, {
      props: {
        selectedZoom: null,
        canGenerate: true,
        hasAutomaticZooms: true,
        motionBlur: { enabled: true, intensity: 0.55 },
      },
      global: { stubs: { Button, ButtonGroup, BigSlider, Switch } },
      attachTo: document.body,
    });
    await wrapper.find('.popover-trigger').trigger('click');
    expect(document.body.textContent).toContain('Regenerate Auto Zooms');
    expect(document.body.textContent).toContain('Cancel');
    wrapper.unmount();
  });

  it('toggles dedicated zoom motion blur and updates its intensity', async () => {
    const motionBlur = { enabled: true, intensity: 0.55 };
    const wrapper = mount(ZoomPanel, {
      props: { selectedZoom, canGenerate: true, hasAutomaticZooms: false, motionBlur },
      global: { stubs: { Button, ButtonGroup, BigSlider, Switch } },
    });

    await wrapper.get('.motion-blur-slider').trigger('click');
    await wrapper.get('.motion-blur-switch').trigger('click');

    expect(wrapper.emitted('update:motionBlur')).toEqual([
      [{ enabled: true, intensity: 0.8 }],
      [{ enabled: false, intensity: 0.55 }],
    ]);
  });

  it('keeps auto-follow Advanced closed by default and exposes the Balanced preset', () => {
    const wrapper = mount(ZoomPanel, {
      props: {
        selectedZoom,
        canGenerate: true,
        hasAutomaticZooms: true,
        motionBlur: { enabled: true, intensity: 0.55 },
        autoFollow: balancedAutoFollow,
      },
      global: { stubs: { Button, ButtonGroup, BigSlider, Switch } },
    });

    const toggle = wrapper.get('[aria-controls="zoom-auto-follow-advanced-panel"]');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('#zoom-auto-follow-advanced-panel').exists()).toBe(false);
    expect(wrapper.get('[data-auto-follow-preset="balanced"]')).toBeDefined();
  });

  it('marks auto-follow Custom after editing and returns to the Balanced preset', async () => {
    const wrapper = mount(ZoomPanel, {
      props: {
        selectedZoom,
        canGenerate: true,
        hasAutomaticZooms: true,
        motionBlur: { enabled: true, intensity: 0.55 },
        autoFollow: balancedAutoFollow,
      },
      global: { stubs: { Button, ButtonGroup, BigSlider, Switch } },
    });

    await wrapper.get('[aria-controls="zoom-auto-follow-advanced-panel"]').trigger('click');
    expect(wrapper.find('#zoom-auto-follow-advanced-panel').exists()).toBe(true);

    await wrapper.get('.auto-follow-safe-zone-slider').trigger('click');
    expect(wrapper.emitted('update:autoFollow')).toContainEqual([
      expect.objectContaining({ safeZone: 0.75, responsiveness: 0.55, directionLock: true }),
    ]);

    await wrapper.get('.auto-follow-response-slider').trigger('click');
    expect(wrapper.emitted('update:autoFollow')).toContainEqual([
      { safeZone: 0.5, responsiveness: 1, directionLock: true },
    ]);

    await wrapper.get('.auto-follow-direction-lock-switch').trigger('click');
    expect(wrapper.emitted('update:autoFollow')).toContainEqual([
      { safeZone: 0.5, responsiveness: 0.55, directionLock: false },
    ]);

    await wrapper.get('[data-auto-follow-preset="stable"]').trigger('click');
    expect(wrapper.emitted('update:autoFollow')).toContainEqual([
      { safeZone: 0.65, responsiveness: 0.3, directionLock: true },
    ]);

    await wrapper.get('[data-auto-follow-preset="responsive"]').trigger('click');
    expect(wrapper.emitted('update:autoFollow')).toContainEqual([
      { safeZone: 0.35, responsiveness: 0.85, directionLock: true },
    ]);

    await wrapper.get('[data-auto-follow-preset="balanced"]').trigger('click');
    expect(wrapper.emitted('update:autoFollow')).toContainEqual([balancedAutoFollow]);
  });

  it('activates 3D with the existing metadata, marks it custom, and preserves it when returning to 2D', async () => {
    const wrapper = mount(ZoomPanel, {
      props: {
        selectedZoom: {
          ...selectedZoom,
          projection: '2d',
          tiltIntensity: 0.42,
          tiltHorizontal: -0.3,
          tiltVertical: 0.7,
          tiltPreset: 'medium',
        },
        canGenerate: true,
        hasAutomaticZooms: false,
        motionBlur: { enabled: true, intensity: 0.55 },
      },
      global: { stubs: { Button, ButtonGroup, BigSlider, Switch } },
    });

    const projectionButtons = wrapper.findAll('.zoom-projection-options button');
    await projectionButtons[1]!.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([
      {
        ...selectedZoom,
        projection: '3d',
        tiltIntensity: 0.42,
        tiltHorizontal: -0.3,
        tiltVertical: 0.7,
        tiltPreset: 'custom',
      },
    ]);

    await wrapper.setProps({
      selectedZoom: {
        ...selectedZoom,
        projection: '3d',
        tiltIntensity: 0.4,
        tiltHorizontal: 0.2,
        tiltVertical: -0.5,
        tiltPreset: 'custom',
      },
    });
    await wrapper.get('.tilt-slider').trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([
      {
        ...selectedZoom,
        projection: '3d',
        tiltIntensity: 1,
        tiltHorizontal: 0.2,
        tiltVertical: -0.5,
        tiltPreset: 'custom',
      },
    ]);

    await wrapper.setProps({
      selectedZoom: {
        ...selectedZoom,
        projection: '3d',
        tiltIntensity: 0.4,
        tiltHorizontal: 0.2,
        tiltVertical: -0.5,
        tiltPreset: 'custom',
      },
    });
    const updatedProjectionButtons = wrapper.findAll('.zoom-projection-options button');
    await updatedProjectionButtons[0]!.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([
      {
        ...selectedZoom,
        projection: '2d',
        tiltIntensity: 0.4,
        tiltHorizontal: 0.2,
        tiltVertical: -0.5,
        tiltPreset: 'custom',
      },
    ]);
  });

  it('emits signed left-right and up-down tilt axis values in 3D mode', async () => {
    const wrapper = mount(ZoomPanel, {
      props: {
        selectedZoom: {
          ...selectedZoom,
          projection: '3d',
          tiltIntensity: 0.6,
          tiltHorizontal: 0.1,
          tiltVertical: -0.2,
        },
        canGenerate: true,
        hasAutomaticZooms: false,
        motionBlur: { enabled: true, intensity: 0.55 },
      },
      global: { stubs: { Button, ButtonGroup, BigSlider, Switch } },
    });

    await wrapper.get('.tilt-horizontal-slider').trigger('click');
    await wrapper.get('.tilt-vertical-slider').trigger('click');

    expect(wrapper.emitted('update')).toContainEqual([
      {
        ...selectedZoom,
        projection: '3d',
        tiltIntensity: 0.6,
        tiltHorizontal: 0.25,
        tiltVertical: -0.2,
        tiltPreset: 'custom',
      },
    ]);
    expect(wrapper.emitted('update')).toContainEqual([
      {
        ...selectedZoom,
        projection: '3d',
        tiltIntensity: 0.6,
        tiltHorizontal: 0.1,
        tiltVertical: -0.6,
        tiltPreset: 'custom',
      },
    ]);
  });

  it('applies Small, Medium, and Large presets while Custom preserves the current values', async () => {
    const wrapper = mount(ZoomPanel, {
      props: {
        selectedZoom: {
          ...selectedZoom,
          projection: '3d',
          tiltIntensity: 0.8,
          tiltHorizontal: -0.25,
          tiltVertical: 0.45,
          tiltPreset: 'custom',
        },
        canGenerate: true,
        hasAutomaticZooms: false,
        motionBlur: { enabled: true, intensity: 0.55 },
      },
      global: { stubs: { Button, ButtonGroup, BigSlider, Switch } },
    });

    expect(wrapper.emitted('update')).toBeUndefined();
    await wrapper.setProps({
      selectedZoom: {
        ...selectedZoom,
        projection: '3d',
        tiltIntensity: 0.9,
        tiltHorizontal: -0.25,
        tiltVertical: 0.45,
        tiltPreset: 'custom',
      },
    });
    expect(wrapper.emitted('update')).toBeUndefined();

    const presetButtons = wrapper.findAll('.zoom-tilt-presets button');
    await presetButtons[0]!.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([
      expect.objectContaining({
        tiltPreset: 'small',
        tiltIntensity: 0.3,
        tiltHorizontal: -0.25,
        tiltVertical: 0.45,
      }),
    ]);
    await presetButtons[1]!.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([
      expect.objectContaining({
        tiltPreset: 'medium',
        tiltIntensity: 0.6,
        tiltHorizontal: -0.25,
        tiltVertical: 0.45,
      }),
    ]);
    await presetButtons[2]!.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([
      expect.objectContaining({
        tiltPreset: 'large',
        tiltIntensity: 1,
        tiltHorizontal: -0.25,
        tiltVertical: 0.45,
      }),
    ]);
    await presetButtons[3]!.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([
      expect.objectContaining({
        tiltPreset: 'custom',
        tiltIntensity: 0.9,
        tiltHorizontal: -0.25,
        tiltVertical: 0.45,
      }),
    ]);
  });

  it('renders Custom as an accessible Lucide icon button and keeps it functional', async () => {
    const wrapper = mount(ZoomPanel, {
      props: {
        selectedZoom: {
          ...selectedZoom,
          projection: '3d',
          tiltIntensity: 0.8,
          tiltHorizontal: -0.25,
          tiltVertical: 0.45,
          tiltPreset: 'custom',
        },
        canGenerate: true,
        hasAutomaticZooms: false,
        motionBlur: { enabled: true, intensity: 0.55 },
      },
      global: { stubs: { Button, ButtonGroup, BigSlider, Switch } },
    });

    const customButton = wrapper.findAll('.zoom-tilt-presets button')[3]!;
    expect(customButton.text()).toBe('');
    expect(customButton.attributes('data-icon')).toBe('lucide');
    expect(customButton.attributes('data-icon-only')).toBe('true');
    expect(customButton.attributes('aria-label')).toBe('Custom');
    expect(customButton.attributes('title')).toBe('Custom');

    await customButton.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([
      expect.objectContaining({
        tiltPreset: 'custom',
        tiltIntensity: 0.8,
        tiltHorizontal: -0.25,
        tiltVertical: 0.45,
      }),
    ]);
  });
});
