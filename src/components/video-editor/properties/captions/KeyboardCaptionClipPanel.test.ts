import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionClip } from '~/media/shared/composition-types';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';

const capture = vi.hoisted(() => ({
  listImportedFonts: vi.fn(),
  pickImportedFont: vi.fn(),
  onFontLibraryChanged: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));

import KeyboardCaptionClipPanel from './KeyboardCaptionClipPanel.vue';

const Input = {
  inheritAttrs: false,
  props: ['modelValue'],
  emits: ['update:modelValue', 'blur'],
  template:
    '<input :placeholder="$attrs.placeholder" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @blur="$emit(\'blur\', $event)" />',
};
const Switch = {
  inheritAttrs: true,
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<button v-bind="$attrs" class="follow-cursor-switch" role="switch" :aria-checked="String(modelValue)" @click="$emit(\'update:modelValue\', false)">Follow</button>',
};
const CaptionStyleControls = {
  props: ['style', 'defaultFontSize', 'sampleText'],
  emits: ['update', 'preview'],
  template:
    '<div class="caption-style-controls"><button class="font-preview" @pointerenter="$emit(\'preview\', { fontFamily: \'serif\' })">Preview</button><button class="font-commit" @click="$emit(\'update\', \'fontWeight\', 400)">Commit</button><button class="font-preview-clear" @click="$emit(\'preview\', null)">Clear</button></div>',
};
const Divider = { template: '<div class="divider-stub" />' };

const keyboardClip: CaptionClip = {
  id: 'keyboard-caption',
  kind: 'caption',
  name: 'Keyboard shortcut',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  caption: {
    type: 'keyboard',
    steps: [{ offsetMs: 0, modifiers: ['control'], key: 'k' }],
    followCursor: true,
    recordedPlatform: 'linux',
    sourceSessionId: 'session-1',
    style: {
      ...createDefaultCaptionStyle(36),
      shadowDirection: 'bottom-right',
    },
  },
};

const stubs = { Input, Switch, CaptionStyleControls, Divider };

beforeEach(() => {
  vi.clearAllMocks();
  capture.listImportedFonts.mockResolvedValue([]);
  capture.pickImportedFont.mockResolvedValue(null);
  capture.onFontLibraryChanged.mockReturnValue(() => undefined);
  (window as unknown as { capture: unknown }).capture = capture;
  Object.defineProperty(window, 'queryLocalFonts', {
    configurable: true,
    value: vi.fn().mockResolvedValue([]),
  });
});

describe('KeyboardCaptionClipPanel', () => {
  it('shares caption styles and edits custom text and follow-cursor independently', async () => {
    const wrapper = mount(KeyboardCaptionClipPanel, {
      props: { clip: keyboardClip },
      global: { stubs },
    });

    expect(wrapper.find('.keyboard-caption-panel').exists()).toBe(true);
    expect(wrapper.findComponent(CaptionStyleControls).props('defaultFontSize')).toBe(28);
    expect(wrapper.findComponent(CaptionStyleControls).props('style')).toMatchObject({
      color: '#ffffff',
      fontSize: 36,
      wrap: true,
    });
    expect(wrapper.findComponent(CaptionStyleControls).props('sampleText')).toBe('Ctrl + K');
    expect(wrapper.get('.follow-cursor-switch').attributes('aria-label')).toBe('Follow cursor');

    await wrapper.get('.font-preview').trigger('pointerenter');
    expect(wrapper.emitted('preview')).toContainEqual([
      expect.objectContaining({
        caption: expect.objectContaining({ style: expect.objectContaining({ fontFamily: 'serif' }) }),
      }),
    ]);
    await wrapper.get('.font-preview-clear').trigger('click');
    expect(wrapper.emitted('preview')?.at(-1)).toEqual([null]);
    await wrapper.get('.font-commit').trigger('click');

    await wrapper.get('.follow-cursor-switch').trigger('click');
    await wrapper.get('input[placeholder="Type custom text..."]').setValue('Ctrl K');
    await wrapper.get('input[placeholder="Type custom text..."]').trigger('blur');

    await vi.waitFor(() =>
      expect(wrapper.emitted('update')).toContainEqual([
        expect.objectContaining({
          caption: expect.objectContaining({ style: expect.objectContaining({ fontWeight: 400 }) }),
        }),
      ]),
    );
    const updates = wrapper.emitted('update') ?? [];
    expect(updates).toContainEqual([
      expect.objectContaining({ caption: expect.objectContaining({ followCursor: false }) }),
    ]);
    expect(updates).toContainEqual([
      expect.objectContaining({
        caption: expect.objectContaining({ style: expect.objectContaining({ customText: 'Ctrl K' }) }),
      }),
    ]);
  });
});
