import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { CaptionClip } from '~/media/shared/composition-types';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
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
  props: ['style', 'defaultFontSize'],
  template: '<div class="caption-style-controls" />',
};
const Divider = { template: '<div class="divider-stub" />' };
const DeleteItem = { template: '<button class="delete-caption" />' };

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

const stubs = { Input, Switch, CaptionStyleControls, Divider, DeleteItem };

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
    expect(wrapper.get('.follow-cursor-switch').attributes('aria-label')).toBe('Follow cursor');

    await wrapper.get('.follow-cursor-switch').trigger('click');
    await wrapper.get('input[placeholder="Type custom text..."]').setValue('Ctrl K');
    await wrapper.get('input[placeholder="Type custom text..."]').trigger('blur');

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
