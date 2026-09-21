import { defineComponent, type Component, type PropType } from 'vue';
import { mount } from '@vue/test-utils';
import { useElementEditor } from '../../elements/useElementEditor';
import type { ElementEditorContext } from '../../elements/element-editor-types';
import type { EditorPresetDocument, EditorPresetSettings } from '~/api/types/editor-preset';
import type { ScreenshotDocument } from '~/api/types/screenshot';
import type { ScreenshotLayer } from '../screenshot-layer-types';

export const settings = (format: 'png' | 'webp' = 'png'): EditorPresetSettings => ({
  editor: { schemaVersion: 1 },
  devices: {},
  export: { format, quality: 0.9, resolution: '1080p' },
  quickSnip: { automaticZoom: false },
});

export const documentFixture = (format: 'png' | 'webp' = 'png'): ScreenshotDocument => ({
  id: 'screen-1',
  name: 'Captured screen',
  width: 1200,
  height: 800,
  source: 'project-media://screenshot/screen-1/source.png',
  preset: settings(format),
  state: null,
});

export const presetFixture = (format: 'png' | 'webp' = 'png'): EditorPresetDocument => ({
  schemaVersion: 1,
  activePresetId: 'default',
  presets: [
    {
      id: 'default',
      name: 'Default',
      protected: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
      settings: settings(format),
    },
  ],
});

export function createScreenshotEditorTestHarness(
  screenshotEditor: Component,
  onCanvasEditor: (editor: ElementEditorContext | null) => void,
) {
  const ButtonStub = defineComponent({
    name: 'Button',
    inheritAttrs: false,
    props: {
      disabled: Boolean,
      loading: Boolean,
      variant: String,
      size: String,
      icon: [Object, Function],
      block: Boolean,
    },
    emits: ['click'],
    template:
      '<button v-bind="$attrs" :disabled="disabled || loading" @click="$emit(\'click\', $event)"><slot /></button>',
  });

  const ButtonGroupStub = {
    name: 'ButtonGroup',
    template: '<div><slot /></div>',
  };
  const SelectStub = defineComponent({
    name: 'Select',
    props: { modelValue: [String, Number], options: Array },
    emits: ['update:modelValue'],
    template:
      '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :value="option.value">{{ option.label }}</option></select>',
  });
  const ShapePropertiesStub = defineComponent({
    name: 'ShapeLayerPropertiesPanel',
    props: { clip: { type: Object, required: true } },
    emits: ['update'],
    template:
      '<section data-testid="shape-properties"><button data-testid="change-shape-style" @click="$emit(\'update\', { fillColor: \'#123456\', rotation: 90 })">Change style</button></section>',
  });
  const ColorFillPresetControlsStub = defineComponent({
    name: 'ColorFillPresetControls',
    props: { modelValue: { type: Object, required: true }, label: String },
    emits: ['update:modelValue'],
    template: '<div data-testid="color-fill-preset-controls">{{ label }}</div>',
  });
  const ScreenshotCanvasStub = defineComponent({
    name: 'ScreenshotCanvas',
    props: {
      source: String,
      state: Object,
      selectedId: String,
      selectedIds: { type: Array as PropType<string[]>, default: () => [] },
      disabled: Boolean,
      cropping: Boolean,
      cursorPacks: Array,
    },
    emits: ['select', 'transform', 'translate', 'error', 'ready', 'crop', 'cropDone'],
    setup() {
      onCanvasEditor(useElementEditor());
    },
    template:
      '<div data-testid="screenshot-canvas"><div class="canvas-controls"><slot name="controls" /></div><slot name="overlay" /></div>',
  });
  const ScreenshotCompositionStub = defineComponent({
    name: 'ScreenshotComposition',
    props: {
      layers: { type: Array as PropType<ScreenshotLayer[]>, required: true },
      selectedId: String,
      selectedIds: { type: Array as PropType<string[]>, default: () => [] },
      source: String,
      disabled: Boolean,
    },
    emits: ['select', 'reorder', 'update', 'visibility', 'remove'],
    template: '<div data-testid="screenshot-composition" />',
  });
  const ScreenshotCursorControlsStub = defineComponent({
    name: 'ScreenshotCursorControls',
    props: {
      cursor: { type: Object, required: true },
      packs: { type: Array, required: true },
    },
    emits: ['update'],
    template: '<section data-testid="screenshot-cursor-controls" />',
  });
  const CanvasPanelStub = defineComponent({
    name: 'CanvasPanel',
    props: ['selectedBackground', 'blurPercent', 'showBackground', 'watermark'],
    emits: ['update:selectedBackground', 'update:blurPercent', 'update:showBackground', 'update:watermark'],
    template: '<div data-testid="canvas-panel" />',
  });
  const ClipPropertiesStub = {
    name: 'ClipPropertiesPanel',
    template: '<div data-testid="clip-properties" />',
  };
  const PresetControlsStub = {
    name: 'EditorPresetControls',
    template: '<div data-testid="preset-controls" />',
  };

  const mountEditor = () =>
    mount(screenshotEditor, {
      props: { id: 'screen-1' },
      global: {
        stubs: {
          UpdateAvailableBadge: true,
          EditorAmbientBackground: {
            name: 'EditorAmbientBackground',
            props: ['background'],
            template: '<div class="editor-ambient-background" />',
          },
          VideoProjectEdition: {
            name: 'VideoProjectEdition',
            props: ['project', 'disabled'],
            emits: ['open-project', 'rename-project', 'delete-project'],
            template: '<div data-testid="project-switcher" />',
          },
          Popover: defineComponent({
            data: () => ({ open: false }),
            template:
              '<div><div @click="open = !open"><slot name="trigger" /></div><div v-if="open" data-testid="popover"><slot /></div></div>',
          }),
          Button: ButtonStub,
          ButtonGroup: ButtonGroupStub,
          Select: SelectStub,
          ColorFillPresetControls: ColorFillPresetControlsStub,
          ShapeLayerPropertiesPanel: ShapePropertiesStub,
          ScreenshotCanvas: ScreenshotCanvasStub,
          ScreenshotComposition: ScreenshotCompositionStub,
          ScreenshotCursorControls: ScreenshotCursorControlsStub,
          CanvasPanel: CanvasPanelStub,
          ClipPropertiesPanel: ClipPropertiesStub,
          EditorPresetControls: PresetControlsStub,
        },
      },
    });

  const clickText = async (wrapper: ReturnType<typeof mount>, text: string) => {
    const button = wrapper.findAll('button').find((candidate) => candidate.text().trim() === text);
    if (!button) throw new Error(`Missing button: ${text}`);
    await button.trigger('click');
  };

  const compositionLayers = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findComponent(ScreenshotCompositionStub).props('layers') as ScreenshotLayer[];

  return {
    ScreenshotCanvasStub,
    ScreenshotCompositionStub,
    ShapePropertiesStub,
    ScreenshotCursorControlsStub,
    ClipPropertiesStub,
    mountEditor,
    clickText,
    compositionLayers,
  };
}

export type ScreenshotEditorTestHarness = ReturnType<typeof createScreenshotEditorTestHarness>;
