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
const ButtonGroup = {
  template: '<div class="button-group-stub"><slot /></div>',
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
      global: { stubs: { PopoverMenuButton, Popover, ButtonGroup, Button } },
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
    // Reset button inside popover
    await wrapper.get('.zoom-reset-btn').trigger('click');
    // Zoom in button
    await wrapper.findAll('.zoom-controls button')[3].trigger('click');
    // Slider inside popover
    await wrapper.get('.zoom-slider').setValue('275');

    expect(wrapper.emitted('add:element')).toEqual([['caption']]);
    expect(wrapper.emitted('update:currentTime')).toEqual([[0], [125.5]]);
    expect(wrapper.emitted('update:isPlaying')).toEqual([[true]]);
    expect(wrapper.emitted('update:zoomLevel')).toContainEqual([100]);
    expect(wrapper.emitted('update:zoomLevel')).toContainEqual([150]);
    expect(wrapper.emitted('update:zoomLevel')).toContainEqual([250]);
    expect(wrapper.emitted('update:zoomLevel')).toContainEqual([275]);
  });

  it('formats hours properly when video is over 1 hour', async () => {
    const wrapper = mount(TimelineToolbar, {
      props: { currentTime: 3665, duration: 7200, isPlaying: false, zoomLevel: 100 },
      global: { stubs: { PopoverMenuButton, Popover, ButtonGroup, Button } },
    });
    expect(wrapper.get('.time-current').text()).toBe('01:01:05');
    expect(wrapper.get('.time-total').text()).toBe('02:00:00');
  });

  it('emits split event when clicked and respects canSplit prop', async () => {
    const wrapper = mount(TimelineToolbar, {
      props: { currentTime: 10, duration: 100, isPlaying: false, zoomLevel: 100, canSplit: true },
      global: { stubs: { PopoverMenuButton, Popover, ButtonGroup, Button } },
    });
    await wrapper.get('.toolbar-split-btn').trigger('click');
    expect(wrapper.emitted('split')).toHaveLength(1);

    await wrapper.setProps({ canSplit: false });
    expect(wrapper.get('.toolbar-split-btn').attributes('disabled')).toBeDefined();
  });

  it('uses stepped zoom controls through the full 3200% range', async () => {
    const wrapper = mount(TimelineToolbar, {
      props: { currentTime: 0, duration: 100, isPlaying: false, zoomLevel: 100 },
      global: { stubs: { PopoverMenuButton, Popover, ButtonGroup, Button } },
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
    expect(wrapper.get('.zoom-slider').attributes()).toMatchObject({ min: '100', max: '3200', step: '25' });
    await wrapper.setProps({ zoomLevel: 3_200 });
    expect(zoomIn().attributes('disabled')).toBeDefined();
  });
});
