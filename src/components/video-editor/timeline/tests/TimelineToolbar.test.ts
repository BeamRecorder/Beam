import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TimelineToolbar from '../TimelineToolbar.vue';

const PopoverMenuButton = {
  emits: ['select'],
  template: '<button class="add-menu-stub" @click="$emit(\'select\', \'caption\')">Add</button>',
};
const Popover = {
  setup() {
    return { close: () => undefined };
  },
  template: '<div class="popover-stub"><slot name="trigger" :isOpen="false" /><slot :close="close" /></div>',
};
const OpenPopover = {
  setup() {
    return { close: () => undefined };
  },
  template: '<div class="popover-stub"><slot name="trigger" :isOpen="true" /><slot :close="close" /></div>',
};
const BigSlider = {
  props: ['modelValue', 'min', 'max', 'step', 'label'],
  emits: ['update:modelValue'],
  template:
    '<button class="big-slider-stub" @click="$emit(\'update:modelValue\', 275)">{{ label }}: {{ modelValue }}</button>',
};
const Button = {
  inheritAttrs: true,
  props: ['disabled', 'iconOnly', 'tooltip', 'tooltipDisabled', 'icon'],
  emits: ['click'],
  template:
    '<button v-bind="$attrs" :disabled="disabled" :data-icon-only="iconOnly ? \'true\' : undefined" :data-tooltip="tooltip || undefined" :data-tooltip-disabled="tooltipDisabled ? \'true\' : undefined" @click="$emit(\'click\')"><component v-if="icon" :is="icon" class="stub-icon" /><slot name="icon" /><slot /></button>',
};
const PreviewQualityPopover = {
  props: ['modelValue', 'performanceSnapshot'],
  emits: ['update:modelValue'],
  template:
    '<div class="preview-quality-popover-stub" :data-quality="modelValue" :data-status="performanceSnapshot?.status || \'idle\'" />',
};
const AddMenuWithItems = {
  props: ['items'],
  emits: ['select'],
  template:
    '<div class="add-menu-items"><button v-for="item in items" :key="item.id" :data-kind="item.id" @click="$emit(\'select\', item.id)">{{ item.label }}</button></div>',
};

describe('TimelineToolbar', () => {
  it('passes the live performance snapshot to the preview quality control', () => {
    const wrapper = mount(TimelineToolbar, {
      props: {
        currentTime: 0,
        duration: 100,
        isPlaying: true,
        zoomLevel: 100,
        previewQuality: 'full',
        performanceSnapshot: {
          status: 'warning',
          scores: { ui: 0.7, worker: 0.2, audio: 0.2, media: 0.2 },
          activity: { playback: true, media: true },
          samples: [],
          issues: ['ui'],
          recommendation: 'half',
        },
      },
      global: { stubs: { PopoverMenuButton, Popover, BigSlider, Button, PreviewQualityPopover } },
    });

    expect(wrapper.get('.preview-quality-popover-stub').attributes('data-status')).toBe('warning');
    expect(wrapper.get('.preview-quality-popover-stub').attributes('data-quality')).toBe('full');
  });

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

  it('exposes Color in Add and emits a color element selection', async () => {
    const wrapper = mount(TimelineToolbar, {
      props: { currentTime: 0, duration: 100, isPlaying: false, zoomLevel: 100 },
      global: { stubs: { PopoverMenuButton: AddMenuWithItems, Popover, BigSlider, Button } },
    });

    const colorItem = wrapper.get('[data-kind="color"]');
    expect(colorItem.text()).toBe('Color');

    await colorItem.trigger('click');
    expect(wrapper.emitted('add:element')).toEqual([['color']]);
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

  it.each([
    ['full', '1x', 'Full resolution', '1x'],
    ['half', '1/2', 'Half resolution', '1/2'],
    ['quarter', '1/4', 'Quarter resolution', '1/4'],
  ] as const)(
    'shows a compact %s preview-quality indicator with a translated accessible label',
    (quality, indicator, label, tooltipLabel) => {
      const wrapper = mount(TimelineToolbar, {
        props: { currentTime: 0, duration: 100, isPlaying: false, zoomLevel: 100, previewQuality: quality },
        global: { stubs: { PopoverMenuButton, Popover, BigSlider, Button } },
      });

      const trigger = wrapper.get('.preview-quality-trigger');
      expect(trigger.get('.preview-quality-indicator').text()).toBe(indicator);
      expect(trigger.attributes('data-tooltip')).toBe(`Preview quality: ${tooltipLabel}`);
      expect(trigger.attributes('aria-label')).toBe(`Preview quality: ${label}`);
    },
  );

  it('disables the trigger tooltip while the quality popover is open', () => {
    const wrapper = mount(TimelineToolbar, {
      props: { currentTime: 0, duration: 100, isPlaying: false, zoomLevel: 100, previewQuality: 'quarter' },
      global: { stubs: { PopoverMenuButton, Popover: OpenPopover, BigSlider, Button } },
    });

    const trigger = wrapper.get('.preview-quality-trigger');
    expect(trigger.get('.preview-quality-indicator').text()).toBe('1/4');
    expect(trigger.attributes('data-tooltip')).toBe('Preview quality: 1/4');
    expect(trigger.attributes('data-tooltip-disabled')).toBe('true');
  });

  it('keeps the popover light while exposing the hint through an info tooltip', async () => {
    const wrapper = mount(TimelineToolbar, {
      props: { currentTime: 0, duration: 100, isPlaying: false, zoomLevel: 100, previewQuality: 'half' },
      global: { stubs: { PopoverMenuButton, Popover, BigSlider, Button } },
    });

    expect(wrapper.get('.preview-quality-heading').text()).toBe('Preview quality');
    expect(wrapper.find('.preview-quality-heading small').exists()).toBe(false);
    const infoButton = wrapper.get('.preview-quality-heading button');
    expect(infoButton.find('.stub-icon').exists()).toBe(true);
    expect(infoButton.attributes('data-tooltip')).toBe('Preview only. Export stays full quality.');
    expect(infoButton.attributes('aria-label')).toBe('Preview only. Export stays full quality.');

    const options = wrapper.findAll('.preview-quality-option');
    expect(options).toHaveLength(3);
    expect(options.map((option) => option.attributes('role'))).toEqual(['radio', 'radio', 'radio']);
    expect(options.map((option) => option.text())).toEqual(['1x', '1/2', '1/4']);
    expect(options.map((option) => option.attributes('aria-label'))).toEqual([
      'Full resolution',
      'Half resolution',
      'Quarter resolution',
    ]);
    expect(options.find((option) => option.classes('active'))?.text()).toBe('1/2');
    expect(options.find((option) => option.classes('active'))?.attributes('aria-checked')).toBe('true');

    for (const [index, option] of options.entries()) {
      await option.trigger('click');
      expect(wrapper.findAll('.preview-quality-option')).toHaveLength(3);
      await wrapper.setProps({ previewQuality: (['full', 'half', 'quarter'] as const)[index] });
      expect(wrapper.findAll('.preview-quality-option')[index]?.attributes('aria-checked')).toBe('true');
    }
    expect(wrapper.emitted('update:previewQuality')).toEqual([['full'], ['half'], ['quarter']]);
  });
});
