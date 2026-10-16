import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ZoomPanel from '../ZoomPanel.vue';
import type { ZoomAutoFollowSettings, ZoomElement } from '@beam/engine/zoom/zoom-types';

const Button = {
  inheritAttrs: true,
  props: {
    disabled: Boolean,
    iconOnly: Boolean,
    icon: [Object, Function],
    tooltip: String,
  },
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

const balancedAutoFollow: ZoomAutoFollowSettings = {
  safeZone: 0.5,
  responsiveness: 0.55,
  directionLock: true,
};

describe('ZoomPanel', () => {
  it('puts the orbit camera inside the single 3D choice', async () => {
    const wrapper = mount(ZoomPanel, {
      props: {
        selectedZoom,
        canGenerate: true,
        hasAutomaticZooms: false,
        motionBlur: { enabled: false, intensity: 0.55 },
      },
      global: { stubs: { Button, ButtonGroup, BigSlider, Switch } },
    });
    await wrapper.findAll('.zoom-projection-options button')[1]!.trigger('click');
    const orbit = wrapper.emitted('update')![0]![0] as ZoomElement;
    expect(orbit).toMatchObject({ projection: 'orbit', transition: 'cinematic' });
    await wrapper.setProps({ selectedZoom: orbit });
    expect(wrapper.findAll('[data-tilt-preset]')).toHaveLength(8);
    wrapper.unmount();
  });
  it('can generate glass lenses directly from an empty zoom inspector', async () => {
    const wrapper = mount(ZoomPanel, {
      props: {
        selectedZoom: null,
        canGenerate: true,
        hasAutomaticZooms: false,
        motionBlur: { enabled: false, intensity: 0.55 },
      },
      global: { stubs: { Button, ButtonGroup, BigSlider, Switch } },
    });
    await wrapper.findAll('.zoom-projection-options button')[2]!.trigger('click');
    expect(wrapper.emitted('update')).toBeUndefined();
    await wrapper.get('.header-action button').trigger('click');
    expect(wrapper.emitted('generate')).toBeUndefined();
    await flushPromises();
    (document.body.querySelector('[role="dialog"] .dialog-actions button:last-child') as HTMLButtonElement).click();
    expect(wrapper.emitted('generate')).toEqual([['glass']]);
    wrapper.unmount();
  });
  it('switches to a larger manual glass lens while retaining existing lens drafts and respecting locks', async () => {
    const wrapper = mount(ZoomPanel, {
      props: {
        selectedZoom,
        canGenerate: true,
        hasAutomaticZooms: false,
        motionBlur: { enabled: false, intensity: 0.55 },
      },
      global: { stubs: { Button, ButtonGroup, BigSlider, Switch } },
    });
    await wrapper.findAll('.zoom-projection-options button')[2]!.trigger('click');
    const lens = wrapper.emitted('update')![0]![0] as ZoomElement;
    expect(lens).toMatchObject({ effect: 'glass', mode: 'manual', depth: 4, glass: { size: 0.6 } });
    await wrapper.setProps({ selectedZoom: lens });
    expect(wrapper.find('.glass-controls').exists()).toBe(true);
    expect(wrapper.find('.zoom-mode-options').exists()).toBe(false);
    await wrapper.get('.header-action button').trigger('click');
    expect(wrapper.emitted('generate')).toBeUndefined();
    await flushPromises();
    (document.body.querySelector('[role="dialog"] .dialog-actions button:last-child') as HTMLButtonElement).click();
    expect(wrapper.emitted('generate')).toEqual([['glass']]);
    await wrapper.setProps({ selectedZoom: { ...lens, locked: true } });
    await wrapper.findAll('.zoom-projection-options button')[0]!.trigger('click');
    expect(wrapper.emitted('update')).toHaveLength(1);
    wrapper.unmount();
  });
  it('offers the same 2D, 3D and glass controls for stills without time or automatic generation', () => {
    const wrapper = mount(ZoomPanel, {
      props: {
        selectedZoom: { ...selectedZoom, mode: 'manual' },
        still: true,
        canGenerate: false,
        hasAutomaticZooms: false,
        canvasSize: { width: 1920, height: 1080 },
        motionBlur: { enabled: false, intensity: 0.55 },
      },
      global: { stubs: { Button, ButtonGroup, BigSlider, Switch } },
    });
    expect(wrapper.findAll('.zoom-projection-options button')).toHaveLength(3);
    expect(wrapper.find('.header-action').exists()).toBe(false);
    expect(wrapper.find('.zoom-mode-options').exists()).toBe(false);
    expect(wrapper.find('.motion-blur-settings').exists()).toBe(false);
    wrapper.unmount();
  });
  it('moves perspective help into a compact Info control', () => {
    const wrapper = mount(ZoomPanel, {
      props: {
        selectedZoom,
        canGenerate: true,
        hasAutomaticZooms: false,
        motionBlur: { enabled: false, intensity: 0.55 },
      },
      global: { stubs: { Button, ButtonGroup, BigSlider, Switch } },
    });
    const info = wrapper.get('.projection-info');
    expect(info.attributes('data-icon-only')).toBe('true');
    expect(info.attributes('title')).toContain('3D camera.');
    expect(info.attributes('title')).toContain('camera.\nRotation');
    expect(info.attributes('aria-label')).toBe('Perspective');
    expect(wrapper.findAll('.section-description').some((element) => element.text().includes('3D camera.'))).toBe(
      false,
    );
    wrapper.unmount();
  });
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
    expect(wrapper.emitted('generate')).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 0));
    (document.body.querySelector('[role="dialog"] .dialog-actions button:last-child') as HTMLButtonElement).click();
    expect(wrapper.emitted('generate')).toHaveLength(1);
    wrapper.unmount();
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
    await wrapper.find('.header-action button').trigger('click');
    expect(document.body.textContent).toContain('Regenerate Auto Zooms');
    expect(document.body.textContent).toContain('Cancel');
    wrapper.unmount();
  });

  it('toggles dedicated zoom motion blur and updates its intensity', async () => {
    const motionBlur = { enabled: true, intensity: 0.55 };
    const wrapper = mount(ZoomPanel, {
      props: {
        selectedZoom,
        canGenerate: true,
        hasAutomaticZooms: false,
        motionBlur,
      },
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
      expect.objectContaining({
        safeZone: 0.75,
        responsiveness: 0.55,
        directionLock: true,
      }),
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

  it('keeps legacy 3D selected without rewriting it and converts only on explicit preset selection', async () => {
    const original = { ...selectedZoom, projection: '3d' as const, tiltIntensity: 0.42, tiltHorizontal: -0.3 };
    const wrapper = mount(ZoomPanel, {
      props: {
        selectedZoom: original,
        canGenerate: true,
        hasAutomaticZooms: false,
        motionBlur: { enabled: true, intensity: 0.55 },
      },
      global: { stubs: { Button, ButtonGroup, BigSlider, Switch } },
    });
    expect(wrapper.findAll('.zoom-projection-options button')).toHaveLength(3);
    expect(wrapper.findAll('.zoom-projection-options button')[1]!.attributes('variant')).toBe('selected');
    expect(wrapper.emitted('update')).toBeUndefined();
    await wrapper.get('[data-tilt-preset="pullback-large"]').trigger('click');
    const changed = wrapper.emitted('update')!.at(-1)![0] as ZoomElement;
    expect(changed).toMatchObject({ projection: 'orbit', orbitSettings: { pullback: 0.5 }, focus: original.focus });
    await wrapper.setProps({ selectedZoom: changed });
    await wrapper.findAll('.zoom-projection-options button')[0]!.trigger('click');
    expect(wrapper.emitted('update')!.at(-1)![0]).toMatchObject({
      projection: '2d',
      orbitSettings: changed.orbitSettings,
    });
    wrapper.unmount();
  });
});
