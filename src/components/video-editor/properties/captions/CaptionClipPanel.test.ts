import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import type { CaptionClip } from '~/media/shared/composition-types';

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
  props: ['options', 'items', 'variant'],
  emits: ['update:modelValue', 'preview:modelValue'],
  template:
    '<div><button v-if="options" class="font-select" :data-variant="variant" @pointerenter="$emit(\'preview:modelValue\', \'serif\')" @click="$emit(\'update:modelValue\', \'serif\')">Font</button><button v-else class="shadow-select" @click="$emit(\'update:modelValue\', \'top-left\')">Select</button></div>',
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
      shape: createDefaultCaptionStyle(36).shape,
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
} as unknown as CaptionClip;

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
    expect(wrapper.findAll('.caption-slider')).toHaveLength(9);
    expect(wrapper.findAll('.color-picker-stub')).toHaveLength(4);
    expect(wrapper.get('.wrap-switch').attributes('aria-checked')).toBe('true');
    expect(wrapper.get('.font-select').attributes('data-variant')).toBe('search');
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

  it('hides highlight controls for non-AI text captions', () => {
    const nonAiClip = Object.assign({}, clip as object, { isAiGenerated: false }) as never;
    const wrapper = mount(CaptionClipPanel, {
      props: { clip: nonAiClip },
      global: { stubs: { Input, ColorPicker, BigSlider, Select, Switch, Button, ButtonGroup, Divider } },
    });

    expect(wrapper.find('.highlight-controls').exists()).toBe(false);
  });

  it('shows available highlight controls for AI captions with word timings', () => {
    const wrapper = mount(CaptionClipPanel, {
      props: { clip },
      global: { stubs: { Input, ColorPicker, BigSlider, Select, Switch, Button, ButtonGroup, Divider } },
    });

    expect(wrapper.find('.highlight-controls').exists()).toBe(true);
    expect(wrapper.find('.highlight-controls .availability-note').exists()).toBe(false);
    expect(wrapper.get('.highlight-controls [role="switch"]').attributes('disabled')).toBeUndefined();
  });

  it('shows the AI timing warning directly below the text input', () => {
    const wrapper = mount(CaptionClipPanel, {
      props: { clip },
      global: { stubs: { Input, ColorPicker, BigSlider, Select, Switch, Button, ButtonGroup, Divider } },
    });

    const input = wrapper.get('input[placeholder="Type custom text..."]');
    const warning = wrapper.get('.ai-edit-warning');
    expect(input.element.parentElement).toBe(warning.element.parentElement);
    expect(input.element.compareDocumentPosition(warning.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(warning.text()).toBe('Editing an AI caption can disrupt its synchronized word timings.');
  });

  it('does not show the AI timing warning for a manual caption', () => {
    const manualClip = { ...clip, isAiGenerated: false };
    const wrapper = mount(CaptionClipPanel, {
      props: { clip: manualClip },
      global: { stubs: { Input, ColorPicker, BigSlider, Select, Switch, Button, ButtonGroup, Divider } },
    });

    expect(wrapper.find('.ai-edit-warning').exists()).toBe(false);
  });

  it('treats an empty custom text value as an override and disables AI word highlighting', () => {
    const emptyCustomTextClip = {
      ...clip,
      caption: {
        ...clip.caption,
        style: { ...clip.caption.style, customText: '' },
      },
    } as CaptionClip;
    const wrapper = mount(CaptionClipPanel, {
      props: { clip: emptyCustomTextClip },
      global: { stubs: { Input, ColorPicker, BigSlider, Select, Switch, Button, ButtonGroup, Divider } },
    });

    const highlightSwitch = wrapper.get('.highlight-controls [role="switch"]');
    expect(highlightSwitch.attributes('disabled')).toBeDefined();
    expect(wrapper.get('.highlight-controls .availability-note').text()).toBe(
      'Remove the custom text to use the original word timings.',
    );
  });

  it('disables highlight controls and explains the AI-only limitation when word timings are missing', () => {
    const aiClipWithoutWords = Object.assign({}, clip as object, {
      caption: {
        type: 'text',
        sentences: [],
        style: createDefaultCaptionStyle(36),
      },
    }) as never;
    const wrapper = mount(CaptionClipPanel, {
      props: { clip: aiClipWithoutWords },
      global: { stubs: { Input, ColorPicker, BigSlider, Select, Switch, Button, ButtonGroup, Divider } },
    });

    expect(wrapper.find('.highlight-controls').exists()).toBe(true);
    expect(wrapper.get('.highlight-controls [role="switch"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.highlight-controls .availability-note').text()).toBe(
      'Highlight text is only available for AI captions for now.',
    );
  });
});
