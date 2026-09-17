import { computed, inject, provide, ref, watch, type InjectionKey } from 'vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { ShapeClip } from '~/media/shared/composition-types';
import { createElementText } from '~/media/shared/element-text';
import { DEFAULT_DRAWING_SETTINGS } from '~/media/shared/freehand';
import {
  DEFAULT_ANNOTATION_SHAPE_STYLE,
  defaultShapePresetFor,
  normalizeShapeLayerStyle,
} from '~/media/shared/shape-layer-style';
import type { ShapeLayerFamily } from '~/media/shared/shape-layer-types';
import type { ElementEditorContext, ElementEditorOptions } from './element-editor-types';

export const ELEMENT_EDITOR: InjectionKey<ElementEditorContext> = Symbol('element-editor');
export const useElementEditor = () => inject(ELEMENT_EDITOR, null);

export function provideElementEditor(options: ElementEditorOptions): ElementEditorContext {
  const { t } = useTranslate('Elements');
  const layers = computed(options.layers);
  const selected = computed(() => layers.value.find((c) => c.id === options.selectedId()) ?? null);
  const editing = ref<ShapeClip | null>(null);
  const drawingMode = ref(false);
  const drawingSettings = ref({ ...DEFAULT_DRAWING_SETTINGS });
  let latestDrawingId: string | null = null;
  const create = (family: ShapeLayerFamily): ShapeClip => {
    const { startMs, durationMs } = options.timing();
    const id = crypto.randomUUID();
    const style =
      family === 'shape'
        ? { ...DEFAULT_ANNOTATION_SHAPE_STYLE }
        : normalizeShapeLayerStyle({ family, preset: defaultShapePresetFor(family) });
    return {
      ...style,
      id,
      trackId: id,
      kind: 'shape',
      assetId: '',
      name: t(family),
      enabled: true,
      order: 0,
      timelineStartMs: startMs,
      timelineDurationMs: durationMs,
      sourceDurationMs: durationMs,
      sourceInMs: 0,
      playbackRate: 1,
      transitions: { entry: null, exit: null },
      transform: { x: 0.3, y: 0.3, width: 0.4, height: family === 'text' || family === 'arrow' ? 0.16 : 0.3 },
      ...(family === 'text' ? { text: createElementText(t('newText')) } : {}),
    };
  };
  const allowed = () => options.canInteract?.() !== false;
  const finishText = () => {
    const clip = editing.value;
    editing.value = null;
    if (clip && layers.value.some((c) => c.id === clip.id)) options.update(clip.id, { text: clip.text });
  };
  const beginText = (id: string) => {
    if (!allowed() || drawingMode.value) return false;
    const clip = layers.value.find((c) => c.id === id);
    if (!clip) return false;
    if (editing.value?.id === id) return true;
    finishText();
    options.select(id);
    editing.value = JSON.parse(JSON.stringify({ ...clip, text: clip.text ?? createElementText() })) as ShapeClip;
    return true;
  };
  const context: ElementEditorContext = {
    canInteract: computed(allowed),
    addImage: options.addImage,
    addHighlight: options.addHighlight,
    addBlur: options.addBlur,
    addColor: options.addColor,
    layers,
    selected,
    editing,
    drawingMode,
    drawingSettings,
    showLayers: options.showLayers ?? false,
    select: options.select,
    add: (family) => {
      if (!allowed()) return;
      finishText();
      if (family === 'drawing') {
        drawingMode.value = !drawingMode.value;
        latestDrawingId = null;
        return;
      }
      drawingMode.value = false;
      latestDrawingId = null;
      const clip = create(family);
      options.insert(clip);
      options.select(clip.id);
      if (family === 'text') beginText(clip.id);
    },
    addDrawing: (value) => {
      if (!allowed()) return;
      const fill = drawingSettings.value.fill ?? { kind: 'color' as const, color: drawingSettings.value.color };
      const clip = {
        ...create('drawing'),
        ...value,
        fill,
        fillColor: fill.kind === 'color' ? fill.color : drawingSettings.value.color,
      };
      options.insert(clip);
      latestDrawingId = clip.id;
      options.select(clip.id);
    },
    updateDrawingSettings: (settings) => {
      drawingSettings.value = settings;
      if (!drawingMode.value || !latestDrawingId || options.selectedId() !== latestDrawingId) return;
      const clip = layers.value.find((layer) => layer.id === latestDrawingId);
      if (clip?.family !== 'drawing' || !clip.drawing) return;
      const fill = settings.fill ?? { kind: 'color' as const, color: settings.color };
      options.update(clip.id, {
        fill,
        ...(fill.kind === 'color' ? { fillColor: fill.color } : {}),
        drawing: {
          ...clip.drawing,
          smoothing: settings.smoothing,
          strokeWidth: settings.strokeWidth,
        },
      });
    },
    update: (patch) => {
      if (!selected.value) return;
      if (editing.value?.id === selected.value.id && patch.text) {
        editing.value.text = patch.text;
        const { text: _text, ...appearance } = patch;
        if (Object.keys(appearance).length) options.update(selected.value.id, appearance);
      } else options.update(selected.value.id, patch);
    },
    remove: () => {
      if (selected.value) options.remove(selected.value.id);
    },
    beginText,
    finishText,
    updateText: (content) => {
      if (editing.value?.text) editing.value.text.content = content.slice(0, 10000);
    },
    cancelText: () => {
      editing.value = null;
    },
  };
  watch(options.selectedId, (id) => {
    if (editing.value && id !== editing.value.id) finishText();
    if (latestDrawingId && id !== latestDrawingId) latestDrawingId = null;
  });
  watch(drawingMode, (active) => {
    if (!active) latestDrawingId = null;
  });
  watch(allowed, (value) => {
    if (!value) {
      finishText();
      drawingMode.value = false;
    }
  });
  provide(ELEMENT_EDITOR, context);
  return context;
}
