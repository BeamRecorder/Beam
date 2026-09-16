import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref, shallowRef, type PropType } from 'vue';
import { createComposition } from '../../composition/engine/clip-engine';
import type { ColorFill } from '~/media/shared/color-fill-types';
import type { DrawingSettings, DrawnElement } from '~/media/shared/element-types';
import type { ShapeClip } from '~/media/shared/composition-types';
import ElementsPanel from '../ElementsPanel.vue';
import { useVideoElements } from '../useVideoElements';

vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: () => ({ t: (key: string) => key }),
}));

vi.mock('~/api/capture', () => ({ capture: {} }));

const ButtonStub = defineComponent({
  name: 'Button',
  props: {
    block: Boolean,
    disabled: Boolean,
    icon: [Object, Function],
    size: String,
    variant: String,
  },
  emits: ['click'],
  setup(props, { emit, slots }) {
    return () => h('button', { disabled: props.disabled, onClick: () => emit('click') }, slots.default?.());
  },
});

const DrawingControlsStub = defineComponent({
  name: 'DrawingControls',
  props: { modelValue: Object },
  emits: ['update:modelValue'],
  setup() {
    return () => h('div', { class: 'drawing-controls-stub' });
  },
});

const ShapeLayerPropertiesPanelStub = defineComponent({
  name: 'ShapeLayerPropertiesPanel',
  props: { clip: { type: Object as PropType<ShapeClip>, required: true } },
  setup(props) {
    return () =>
      h('div', {
        class: 'shape-layer-properties-panel-stub',
        'data-clip-id': props.clip.id,
        'data-family': props.clip.family,
      });
  },
});

const panelStubs = {
  Button: ButtonStub,
  Divider: true,
  DrawingControls: DrawingControlsStub,
  ShapeLayerPropertiesPanel: ShapeLayerPropertiesPanelStub,
};

const wrappers: VueWrapper[] = [];

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
});

describe('ElementsPanel', () => {
  it('disables family tools during playback and enables them after pausing', async () => {
    const composition = shallowRef(createComposition([], []));
    const selectedId = ref<string | null>(null);
    const activeTab = ref('elements');
    const currentTime = ref(0);
    const isPlaying = ref(true);
    const Host = defineComponent({
      setup() {
        useVideoElements({
          composition,
          selectedId,
          activeTab,
          currentTime,
          isPlaying,
          select: vi.fn(),
          clearZoom: vi.fn(),
        });
        return () => h(ElementsPanel);
      },
    });
    const wrapper = mount(Host);
    wrappers.push(wrapper);
    const familyButtons = () =>
      wrapper
        .findAll('.element-tools button')
        .filter((button) => ['shape', 'arrow', 'text', 'drawing'].includes(button.text().trim()));

    expect(familyButtons()).toHaveLength(4);
    expect(familyButtons().every((button) => button.attributes('disabled') !== undefined)).toBe(true);

    isPlaying.value = false;
    await nextTick();

    expect(familyButtons().every((button) => button.attributes('disabled') === undefined)).toBe(true);
  });

  it('keeps drawing controls active and updates the latest stroke from their settings', async () => {
    let nextId = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `completed-drawing-${++nextId}` });
    const composition = shallowRef(createComposition([], []));
    const selectedId = ref<string | null>(null);
    const activeTab = ref('elements');
    const currentTime = ref(0);
    const isPlaying = ref(false);
    let editor: ReturnType<typeof useVideoElements> | null = null;
    const Host = defineComponent({
      setup() {
        editor = useVideoElements({
          composition,
          selectedId,
          activeTab,
          currentTime,
          isPlaying,
          select: (id) => {
            selectedId.value = id;
          },
          clearZoom: vi.fn(),
        });
        return () => h(ElementsPanel);
      },
    });
    const wrapper = mount(Host, { global: { stubs: panelStubs } });
    wrappers.push(wrapper);

    const drawButton = wrapper.findAll('.element-tools button').find((button) => button.text().trim() === 'drawing');
    expect(drawButton).toBeDefined();
    await drawButton!.trigger('click');
    await nextTick();

    expect(editor!.drawingMode.value).toBe(true);
    expect(wrapper.find('.drawing-controls-stub').exists()).toBe(true);
    expect(wrapper.find('.hint').exists()).toBe(true);
    expect(wrapper.find('.shape-layer-properties-panel-stub').exists()).toBe(false);

    const drawn: DrawnElement = {
      transform: { x: 0.2, y: 0.25, width: 0.4, height: 0.3 },
      drawing: {
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.9, y: 0.8 },
        ],
        smoothing: 45,
        strokeWidth: 12,
      },
    };
    editor!.addDrawing(drawn);
    await nextTick();

    const firstSelected = editor!.selected.value;
    const fallbackColor = editor!.drawingSettings.value.color;
    expect(firstSelected).toMatchObject({ family: 'drawing', preset: 'freehand', drawing: drawn.drawing });
    expect(wrapper.find('.shape-layer-properties-panel-stub').exists()).toBe(false);
    expect(wrapper.find('.drawing-controls-stub').exists()).toBe(true);
    expect(wrapper.find('.hint').exists()).toBe(true);
    expect(editor!.drawingMode.value).toBe(true);

    const gradientFill: ColorFill = {
      kind: 'gradient',
      gradient: {
        type: 'linear',
        angle: 90,
        stops: [
          { id: 'start', position: 0, color: '#123456', alpha: 1 },
          { id: 'end', position: 1, color: '#abcdef', alpha: 0.5 },
        ],
      },
    };
    const gradientSettings: DrawingSettings = {
      ...editor!.drawingSettings.value,
      fill: gradientFill,
      strokeWidth: 24,
      smoothing: 78,
    };
    wrapper.findComponent(DrawingControlsStub).vm.$emit('update:modelValue', gradientSettings);
    await nextTick();

    expect(editor!.drawingSettings.value).toEqual(gradientSettings);
    expect(editor!.selected.value).toMatchObject({
      id: firstSelected?.id,
      fill: gradientFill,
      fillColor: fallbackColor,
      drawing: { ...drawn.drawing, smoothing: 78, strokeWidth: 24 },
    });
    expect(wrapper.findComponent(DrawingControlsStub).props('modelValue')).toEqual(gradientSettings);
    expect(editor!.drawingMode.value).toBe(true);

    const solidFill: ColorFill = { kind: 'color', color: '#654321' };
    const solidSettings: DrawingSettings = {
      ...gradientSettings,
      color: solidFill.color,
      fill: solidFill,
      strokeWidth: 16,
      smoothing: 32,
    };
    wrapper.findComponent(DrawingControlsStub).vm.$emit('update:modelValue', solidSettings);
    await nextTick();

    expect(editor!.drawingSettings.value).toEqual(solidSettings);
    expect(editor!.selected.value).toMatchObject({
      id: firstSelected?.id,
      fill: solidFill,
      fillColor: solidFill.color,
      drawing: { ...drawn.drawing, smoothing: 32, strokeWidth: 16 },
    });
    expect(wrapper.findComponent(DrawingControlsStub).props('modelValue')).toEqual(solidSettings);

    const nextDrawing: DrawnElement = {
      transform: { x: 0.3, y: 0.3, width: 0.3, height: 0.3 },
      drawing: {
        points: [
          { x: 0.2, y: 0.2 },
          { x: 0.8, y: 0.8 },
        ],
        smoothing: solidSettings.smoothing,
        strokeWidth: solidSettings.strokeWidth,
      },
    };
    editor!.addDrawing(nextDrawing);
    await nextTick();

    const nextSelected = editor!.selected.value;
    expect(nextSelected).toMatchObject({
      family: 'drawing',
      fill: solidFill,
      fillColor: solidFill.color,
      drawing: nextDrawing.drawing,
    });
    expect(editor!.drawingSettings.value).toEqual(solidSettings);
    expect(wrapper.find('.drawing-controls-stub').exists()).toBe(true);
    expect(editor!.drawingMode.value).toBe(true);

    const finishDrawing = wrapper.findAll('button').find((button) => button.text().trim() === 'finishDrawing');
    expect(finishDrawing).toBeDefined();
    await finishDrawing!.trigger('click');
    await nextTick();

    const propertiesPanel = wrapper.find('.shape-layer-properties-panel-stub');
    expect(editor!.drawingMode.value).toBe(false);
    expect(wrapper.find('.drawing-controls-stub').exists()).toBe(false);
    expect(wrapper.find('.hint').exists()).toBe(false);
    expect(propertiesPanel.attributes('data-clip-id')).toBe(nextSelected?.id);
    expect(propertiesPanel.attributes('data-family')).toBe('drawing');
  });
});
