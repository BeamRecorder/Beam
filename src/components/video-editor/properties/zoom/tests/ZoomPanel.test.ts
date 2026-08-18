import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ZoomPanel from '../ZoomPanel.vue';
import type { ZoomElement } from '../../../zoom/zoom-types';

const Button = {
  inheritAttrs: true,
  props: ['disabled'],
  emits: ['click'],
  template: '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
};
const ButtonGroup = { template: '<div class="button-group"><slot /></div>' };
const BigSlider = {
  props: ['label'],
  emits: ['update:modelValue'],
  template:
    "<button :class=\"label?.toLowerCase().includes('motion') ? 'motion-blur-slider' : 'depth-slider'\" @click=\"$emit('update:modelValue', label?.toLowerCase().includes('motion') ? 80 : 4)\">Slider</button>",
};
const Switch = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<button class="motion-blur-switch" @click="$emit(\'update:modelValue\', !modelValue)">Switch</button>',
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
    await wrapper.findAll('.button-group button')[1].trigger('click');
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
});
