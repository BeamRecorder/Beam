import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const capture = vi.hoisted(() => ({
  listImportedFonts: vi.fn(),
  pickImportedFont: vi.fn(),
  onFontLibraryChanged: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));

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
  props: ['label'],
  emits: ['update:modelValue'],
  template:
    '<button class="caption-slider" :data-label="label" @click="$emit(\'update:modelValue\', 42)">Slider</button>',
};
const Select = {
  props: ['options', 'items'],
  emits: ['update:modelValue', 'preview:modelValue'],
  template:
    '<div><button v-if="options" class="font-select" @pointerenter="$emit(\'preview:modelValue\', \'serif\')" @click="$emit(\'update:modelValue\', \'serif\')">Font</button><button v-else class="shadow-select" @click="$emit(\'update:modelValue\', \'top-left\')">Select</button></div>',
};
const Switch = {
  inheritAttrs: true,
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<button v-bind="$attrs" class="wrap-switch" role="switch" :aria-checked="String(modelValue)" @click="$emit(\'update:modelValue\', false)">Wrap</button>',
};
const Button = {
  inheritAttrs: false,
  emits: ['click'],
  template: '<button v-bind="$attrs" class="caption-action" @click="$emit(\'click\')"><slot /></button>',
};
const ButtonGroup = { template: '<div class="button-group-stub"><slot /></div>' };
const Divider = { template: '<div class="divider-stub" />' };

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
      fontFamily: 'sans-serif',
      fontWeight: 800,
      fontStyle: 'normal',
      textAlign: 'center',
      lineHeight: 1.2,
      letterSpacing: 0,
    },
  },
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  capture.listImportedFonts.mockResolvedValue([]);
  capture.pickImportedFont.mockResolvedValue(null);
  capture.onFontLibraryChanged.mockReturnValue(() => undefined);
  (window as unknown as { capture: unknown }).capture = capture;
  Object.defineProperty(window, 'queryLocalFonts', {
    configurable: true,
    value: vi.fn().mockResolvedValue([{ family: 'serif' }]),
  });
});

describe('CaptionClipPanel', () => {
  it('commits text and typography controls without exposing word timing fields', async () => {
    const wrapper = mount(CaptionClipPanel, {
      props: { clip },
      global: { stubs: { Input, ColorPicker, BigSlider, Select, Switch, Button, ButtonGroup, Divider } },
    });
    expect(wrapper.findAll('.caption-slider')).toHaveLength(7);
    expect(wrapper.findAll('.color-picker-stub')).toHaveLength(3);
    expect(wrapper.get('.wrap-switch').attributes('aria-checked')).toBe('true');
    expect(wrapper.find('.follow-cursor-setting').exists()).toBe(false);
    await wrapper.get('.wrap-switch').trigger('click');
    await wrapper.find('input[placeholder="Type custom text..."]').setValue('Custom caption');
    await wrapper.find('input[placeholder="Type custom text..."]').trigger('blur');
    await wrapper.findAll('.color-picker-stub')[0].trigger('click');
    await wrapper.find('.caption-slider').trigger('click');
    await wrapper.get('.shadow-select').trigger('click');
    await wrapper.get('[aria-label="Bold"]').trigger('click');
    await wrapper.get('[aria-label="Align left"]').trigger('click');
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() =>
      expect(
        (window as unknown as { queryLocalFonts: ReturnType<typeof vi.fn> }).queryLocalFonts,
      ).toHaveBeenCalledOnce(),
    );
    await wrapper.get('.font-select').trigger('pointerenter');
    await vi.waitFor(() =>
      expect(wrapper.emitted('preview')).toContainEqual([
        expect.objectContaining({
          caption: expect.objectContaining({ style: expect.objectContaining({ fontFamily: 'serif' }) }),
        }),
      ]),
    );
    const updateCountBeforeFontCommit = wrapper.emitted('update')?.length ?? 0;
    await wrapper.get('.font-select').trigger('click');
    await vi.waitFor(() => expect(wrapper.emitted('update')!.length).toBeGreaterThan(updateCountBeforeFontCommit));
    expect(
      wrapper
        .emitted('update')!
        .slice(updateCountBeforeFontCommit)
        .some(
          ([updated]) =>
            (updated as never as { caption: { style: { fontFamily?: string } } }).caption.style.fontFamily === 'serif',
        ),
    ).toBe(true);
    expect(wrapper.find('input[aria-label="Caption word"]').exists()).toBe(false);
    expect(wrapper.find('input[aria-label="Word start time"]').exists()).toBe(false);
    expect(wrapper.find('input[aria-label="Word end time"]').exists()).toBe(false);
    await vi.waitFor(() => expect(wrapper.emitted('update')).toBeTruthy());
    expect(
      wrapper
        .emitted('update')!
        .some(
          ([updated]) =>
            (updated as unknown as { caption: { style: { wrap?: boolean } } }).caption.style.wrap === false,
        ),
    ).toBe(true);
    expect(
      wrapper.emitted('update')!.some(
        ([updated]) =>
          (
            updated as never as {
              caption: { style: { fontFamily?: string; fontWeight?: number; textAlign?: string } };
            }
          ).caption.style.fontFamily === 'serif',
      ),
    ).toBe(true);
    expect(
      wrapper
        .emitted('update')!
        .some(
          ([updated]) =>
            (updated as never as { caption: { style: { fontWeight?: number } } }).caption.style.fontWeight === 400,
        ),
    ).toBe(true);
    expect(
      wrapper
        .emitted('update')!
        .some(
          ([updated]) =>
            (updated as never as { caption: { style: { textAlign?: string } } }).caption.style.textAlign === 'left',
        ),
    ).toBe(true);
    expect(wrapper.emitted('update')!.length).toBeGreaterThan(0);
    wrapper.unmount();
  });

  it('renders nothing without a selected caption clip', () => {
    const wrapper = mount(CaptionClipPanel, {
      props: { clip: null },
      global: { stubs: { Input, ColorPicker, BigSlider, Select, Switch, Button, ButtonGroup, Divider } },
    });
    expect(wrapper.find('.caption-clip-panel').exists()).toBe(false);
  });
});
