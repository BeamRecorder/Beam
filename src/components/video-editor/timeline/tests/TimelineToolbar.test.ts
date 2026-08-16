import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TimelineToolbar from '../TimelineToolbar.vue';

const PopoverMenuButton = {
  emits: ['select'],
  template: '<button class="add-menu-stub" @click="$emit(\'select\', \'caption\')">Add</button>',
};
const Popover = {
  template: '<div class="popover-stub"><slot name="trigger" /><slot /></div>',
};
const BigSlider = {
  props: ['modelValue', 'min', 'max', 'step', 'label'],
  emits: ['update:modelValue'],
  template:
    '<button class="big-slider-stub" @click="$emit(\'update:modelValue\', 275)">{{ label }}: {{ modelValue }}</button>',
};
const Button = {
  inheritAttrs: true,
  props: ['disabled'],
  emits: ['click'],
  template: '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
};

describe('TimelineToolbar', () => {
  it('formats time cleanly, controls playback, adds elements and adjusts zoom', async () => {
    const wrapper = mount(TimelineToolbar, {
      props: { currentTime: 65.12, duration: 125.5, isPlaying: false, zoomLevel: 200 },
      global: { stubs: { PopoverMenuButton, Popover, BigSlider, Button } },
    });
    expect(wrapper.get('.time-current').text()).toBe('01:05');
    expect(wrapper.get('.time-total').text()).toBe('02:05');
    await wrapper.get('.add-menu-stub').trigger('click');
    await wrapper.findAll('.nav-controls button')[0].trigger('click');
    await wrapper.findAll('.nav-controls button')[1].trigger('click');
    await wrapper.findAll('.nav-controls button')[2].trigger('click');

    // Double clicking percentage resets zoom
    await wrapper.get('.zoom-percent-trigger').trigger('dblclick');
    // Zoom out button
    await wrapper.findAll('.zoom-controls button')[0].trigger('click');
    // Zoom in button
    await wrapper.findAll('.zoom-controls button')[3].trigger('click');
    // BigSlider inside popover
    await wrapper.get('.big-slider-stub').trigger('click');

    expect(wrapper.emitted('add:element')).toEqual([['caption']]);
    expect(wrapper.emitted('update:currentTime')).toEqual([[0], [125.5]]);
    expect(wrapper.emitted('update:isPlaying')).toEqual([[true]]);
    expect(wrapper.emitted('update:zoomLevel')).toContainEqual([100]);
    expect(wrapper.emitted('update:zoomLevel')).toContainEqual([150]);
    expect(wrapper.emitted('update:zoomLevel')).toContainEqual([250]);
    expect(wrapper.emitted('update:zoomLevel')).toContainEqual([275]);
  });

  it('keeps the toolbar height while loading and swaps controls for an animated skeleton', async () => {
    const wrapper = mount(TimelineToolbar, {
      props: { currentTime: 0, duration: 100, isPlaying: false, zoomLevel: 100, loading: true },
      global: { stubs: { PopoverMenuButton, Popover, BigSlider, Button } },
    });

    expect(wrapper.find('.timeline-toolbar').exists()).toBe(true);
    expect(wrapper.find('.shimmer-animated-gradient').exists()).toBe(true);
    expect(wrapper.get('.timeline-toolbar-loading-skeleton').attributes('style')).toContain('height: 36px');
    expect(wrapper.classes()).toContain('is-loading');
    expect(wrapper.find('.nav-controls').exists()).toBe(true);

    await wrapper.setProps({ loading: false });
    await wrapper.vm.$nextTick();
    expect(wrapper.classes()).not.toContain('is-loading');
    expect(wrapper.find('.shimmer-animated-gradient').exists()).toBe(false);
    expect(wrapper.find('.nav-controls').exists()).toBe(true);
  });

  it('formats hours properly when video is over 1 hour', async () => {
    const wrapper = mount(TimelineToolbar, {
      props: { currentTime: 3665, duration: 7200, isPlaying: false, zoomLevel: 100 },
      global: { stubs: { PopoverMenuButton, Popover, BigSlider, Button } },
    });
    expect(wrapper.get('.time-current').text()).toBe('01:01:05');
    expect(wrapper.get('.time-total').text()).toBe('02:00:00');
  });

  it('emits split event when clicked and respects canSplit prop', async () => {
    const wrapper = mount(TimelineToolbar, {
      props: { currentTime: 10, duration: 100, isPlaying: false, zoomLevel: 100, canSplit: true },
      global: { stubs: { PopoverMenuButton, Popover, BigSlider, Button } },
    });
    await wrapper.get('.toolbar-split-btn').trigger('click');
    expect(wrapper.emitted('split')).toHaveLength(1);

    await wrapper.setProps({ canSplit: false });
    expect(wrapper.get('.toolbar-split-btn').attributes('disabled')).toBeDefined();
  });

  it('uses stepped zoom controls through the full 3200% range', async () => {
    const wrapper = mount(TimelineToolbar, {
      props: { currentTime: 0, duration: 100, isPlaying: false, zoomLevel: 100 },
      global: { stubs: { PopoverMenuButton, Popover, BigSlider, Button } },
    });
    const zoomIn = () => wrapper.findAll('.zoom-controls button')[3]!;

    await zoomIn().trigger('click');
    expect(wrapper.emitted('update:zoomLevel')).toContainEqual([150]);
    await wrapper.setProps({ zoomLevel: 450 });
    await zoomIn().trigger('click');
    expect(wrapper.emitted('update:zoomLevel')).toContainEqual([500]);
    await wrapper.setProps({ zoomLevel: 900 });
    await zoomIn().trigger('click');
    expect(wrapper.emitted('update:zoomLevel')).toContainEqual([1_000]);
    await wrapper.setProps({ zoomLevel: 3_000 });
    await zoomIn().trigger('click');
    expect(wrapper.emitted('update:zoomLevel')).toContainEqual([3_200]);
    await wrapper.setProps({ zoomLevel: 3_200 });
    expect(zoomIn().attributes('disabled')).toBeDefined();
  });
});
