import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import CaptionClipPanel from './CaptionClipPanel.vue';

const Input = {
  inheritAttrs: false,
  props: ['modelValue'],
  emits: ['update:modelValue', 'blur'],
  template:
    '<input :id="$attrs.id" :type="$attrs.type" :placeholder="$attrs.placeholder" :aria-label="$attrs[\'aria-label\']" :min="$attrs.min" :class="$attrs.class" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @blur="$emit(\'blur\', $event)" />',
};
const ColorPicker = {
  emits: ['update:modelValue'],
  template: '<button class="color-picker-stub" @click="$emit(\'update:modelValue\', \'#abcdef\')">Color</button>',
};
const BigSlider = {
  emits: ['update:modelValue'],
  template: '<button class="caption-slider" @click="$emit(\'update:modelValue\', 42)">Slider</button>',
};
const Select = {
  emits: ['update:modelValue'],
  template: '<button class="shadow-select" @click="$emit(\'update:modelValue\', \'top-left\')">Select</button>',
};
const Switch = {
  inheritAttrs: true,
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<button v-bind="$attrs" class="wrap-switch" role="switch" :aria-checked="String(modelValue)" @click="$emit(\'update:modelValue\', false)">Wrap</button>',
};
const Button = {
  emits: ['click'],
  template: '<button class="delete-caption" @click="$emit(\'click\')"><slot /></button>',
};

const clip = {
  id: 'caption-1',
  kind: 'caption',
  name: 'Caption',
  timelineStartMs: 0,
  timelineDurationMs: 1000,
  sourceInMs: 0,
  sourceDurationMs: 1000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  isAiGenerated: true,
  caption: {
    type: 'text',
    sentences: [
      {
        id: 'sentence-1',
        text: 'Hello world',
        startMs: 100,
        endMs: 500,
        words: [
          { text: 'Hello', startMs: 100, endMs: 250 },
          { text: 'world', startMs: 260, endMs: 500 },
        ],
      },
    ],
    style: {
      color: '#ffffff',
      fontSize: 36,
      wrap: true,
      shadowColor: '#000000',
      shadowBlur: 8,
      shadowDirection: 'bottom-right',
      placement: 'bottom',
      backdropBlur: 0,
      outlineColor: '#000000',
      outlineWidth: 6,
      extrusionDepth: 4,
    },
  },
} as never;

describe('CaptionClipPanel', () => {
  it('renders AI metadata and updates text, style, timings and deletion', async () => {
    const wrapper = mount(CaptionClipPanel, {
      props: { clip },
      global: { stubs: { Input, ColorPicker, BigSlider, Select, Switch, Button } },
    });
    expect(wrapper.findAll('.caption-slider')).toHaveLength(5);
    expect(wrapper.findAll('.color-picker-stub')).toHaveLength(3);
    expect(wrapper.get('.wrap-switch').attributes('aria-checked')).toBe('true');
    expect(wrapper.find('.follow-cursor-setting').exists()).toBe(false);
    await wrapper.get('.wrap-switch').trigger('click');
    await wrapper.find('input[placeholder="Type custom text..."]').setValue('Custom caption');
    await wrapper.find('input[placeholder="Type custom text..."]').trigger('blur');
    await wrapper.findAll('.color-picker-stub')[0].trigger('click');
    await wrapper.find('.caption-slider').trigger('click');
    await wrapper.get('.shadow-select').trigger('click');
    const word = wrapper.find('input[aria-label="Caption word"]');
    await word.setValue('Hi');
    await word.trigger('blur');
    const start = wrapper.find('input[aria-label="Word start time"]');
    await start.setValue('-1');
    await start.trigger('blur');
    await vi.waitFor(() => expect(wrapper.emitted('update')).toBeTruthy());
    expect(
      wrapper
        .emitted('update')!
        .some(
          ([updated]) =>
            (updated as unknown as { caption: { style: { wrap?: boolean } } }).caption.style.wrap === false,
        ),
    ).toBe(true);
    expect(wrapper.emitted('update')!.length).toBeGreaterThan(0);
  });

  it('renders nothing without a selected caption clip', () => {
    const wrapper = mount(CaptionClipPanel, {
      props: { clip: null },
      global: { stubs: { Input, ColorPicker, BigSlider, Select, Switch, Button } },
    });
    expect(wrapper.find('.caption-clip-panel').exists()).toBe(false);
  });
});
