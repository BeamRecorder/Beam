import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import type { ShapeClip } from '~/media/shared/composition-types';
import type { ElementText } from '~/media/shared/element-types';
import { createElementText } from '~/media/shared/element-text';
import ElementTextControls from '../ElementTextControls.vue';

const importedFontId = 'b'.repeat(64);

vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: () => ({ t: (key: string) => `translated:${key}` }),
}));

const uiStubs = {
  Button: defineComponent({
    props: {
      ariaLabel: String,
      icon: [Object, Function],
      iconOnly: Boolean,
      size: String,
      tooltip: String,
      variant: String,
    },
    emits: ['click'],
    setup(props, { emit, slots }) {
      return () =>
        h(
          'button',
          { 'aria-label': props.ariaLabel, title: props.tooltip, onClick: () => emit('click') },
          slots.default?.(),
        );
    },
  }),
  ButtonGroup: defineComponent({
    setup(_props, { slots }) {
      return () => h('div', slots.default?.());
    },
  }),
  BigSlider: defineComponent({
    props: { label: String, modelValue: Number },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h(
          'button',
          { class: 'slider-stub', 'data-label': props.label, onClick: () => emit('update:modelValue', 17) },
          props.label,
        );
    },
  }),
  Divider: defineComponent({ setup: () => () => h('hr') }),
  Textarea: defineComponent({
    props: { modelValue: String, rows: Number },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h('textarea', {
          value: props.modelValue,
          rows: props.rows,
          onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
        });
    },
  }),
  CaptionStyleControls: defineComponent({
    name: 'CaptionStyleControls',
    props: { style: Object, sampleText: String, defaultFontSize: Number },
    emits: ['update', 'preview'],
    setup(_props, { emit }) {
      return () =>
        h(
          'button',
          {
            class: 'caption-style-controls-stub',
            onClick: () => {
              emit('update', 'fontFamily', 'Beam Display');
              emit('update', 'fontAssetId', importedFontId);
            },
          },
          'Commit font',
        );
    },
  }),
};

const clipWithText = (): ShapeClip => ({
  id: 'text-layer',
  trackId: 'text-track',
  kind: 'shape',
  name: 'Text layer',
  assetId: '',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.5 },
  family: 'shape',
  preset: 'rounded-rectangle',
  fillColor: '#ff5a1f',
  borderColor: '#ffffff',
  borderWidth: 0,
  cornerRadius: 16,
  arrowThickness: 36,
  arrowHeadSize: 38,
  rotation: 0,
  opacityEnabled: false,
  opacity: 70,
  backdropBlur: 35,
  shadowEnabled: false,
  shadowColor: '#000000',
  shadowBlur: 32,
  shadowDirection: 'bottom-right',
  text: createElementText('Original text'),
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ElementTextControls', () => {
  it('keeps content, padding, alignment, and paired font updates in one local text draft', async () => {
    const clip = ref(clipWithText());
    const updates: ElementText[] = [];
    const Host = defineComponent({
      setup() {
        return () =>
          h(ElementTextControls, {
            clip: clip.value,
            onUpdate: (text: ElementText) => {
              updates.push(text);
              clip.value = { ...clip.value, text };
            },
          });
      },
    });
    const wrapper = mount(Host, { global: { stubs: uiStubs } });
    await flushPromises();

    await wrapper.get('textarea').setValue('Updated from properties');
    await wrapper.get('.slider-stub[data-label="translated:textPadding"]').trigger('click');
    await wrapper.get('[aria-label="translated:top"]').trigger('click');
    await wrapper.get('.caption-style-controls-stub').trigger('click');
    await flushPromises();

    expect(clip.value.text).toMatchObject({
      content: 'Updated from properties',
      padding: 17,
      verticalAlign: 'top',
      style: {
        fontFamily: 'Beam Display',
        fontAssetId: importedFontId,
      },
    });
    expect(updates.at(-1)).toMatchObject({
      content: 'Updated from properties',
      padding: 17,
      verticalAlign: 'top',
      style: expect.objectContaining({ fontFamily: 'Beam Display', fontAssetId: importedFontId }),
    });
    wrapper.unmount();
  });
});
