import { computed, inject, provide, ref, watch, type InjectionKey } from 'vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { ShapeClip } from '@beam/engine/shared/composition-types';
import { createElementText } from '@beam/engine/shared/element-text';
import { DEFAULT_DRAWING_SETTINGS } from '@beam/engine/shared/freehand';
import {
  DEFAULT_ANNOTATION_SHAPE_STYLE,
  defaultShapePresetFor,
  normalizeShapeLayerStyle,
} from '@beam/engine/shared/shape-layer-style';
import { arrowVector, vectorForShape } from '@beam/engine/shared/shape-vector-presets';
import { arrowDefinition } from '@beam/engine/shared/arrow-catalog';
import { drawingToVector } from '@beam/engine/shared/shape-vector-drawing';
import { finishAnchorPath } from '@beam/engine/shared/shape-vector-anchors';
import type { VectorNode, VectorNodeSelection } from '@beam/engine/shared/shape-vector-types';
import type { ShapeLayerFamily } from '@beam/engine/shared/shape-layer-types';
import type { ElementEditorContext, ElementEditorOptions } from './element-editor-types';

export const ELEMENT_EDITOR: InjectionKey<ElementEditorContext> = Symbol('element-editor');
export const useElementEditor = () => inject(ELEMENT_EDITOR, null);

export function provideElementEditor(options: ElementEditorOptions): ElementEditorContext {
  const { t } = useTranslate('Elements');
  const layers = computed(options.layers);
  const selected = computed(() => layers.value.find((c) => c.id === options.selectedId()) ?? null);
  const editing = ref<ShapeClip | null>(null);
  const drawingMode = ref(false);
  const drawingArrow = ref(false);
  const anchorDraft = ref<VectorNode[] | null>(null);
  const vectorEditing = ref<string | null>(null);
  const selectedNode = ref<VectorNodeSelection | null>(null);
  const canvasSize = computed(() => options.canvasSize?.() ?? null);
  const finishVector = () => {
    vectorEditing.value = null;
    selectedNode.value = null;
  };
  const drawingSettings = ref({ ...DEFAULT_DRAWING_SETTINGS });
  let latestDrawingId: string | null = null;
  const create = (family: ShapeLayerFamily): ShapeClip => {
    const { startMs, durationMs } = options.timing();
    const id = crypto.randomUUID();
    const style =
      family === 'shape'
        ? { ...DEFAULT_ANNOTATION_SHAPE_STYLE }
        : normalizeShapeLayerStyle({
            family,
            preset: defaultShapePresetFor(family),
            ...(family === 'arrow' ? { arrowThickness: 12, arrowHeadSize: 18 } : {}),
          });
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
      transform: {
        x: 0.3,
        y: 0.3,
        width: family === 'arrow' ? 0.2 : 0.4,
        height: family === 'arrow' ? 0.055 : family === 'text' ? 0.16 : 0.3,
      },
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
    finishVector();
    options.select(id);
    editing.value = JSON.parse(JSON.stringify({ ...clip, text: clip.text ?? createElementText() })) as ShapeClip;
    return true;
  };
  const context: ElementEditorContext = {
    canInteract: computed(allowed),
    canvasSize,
    vectorEditing,
    selectedNode,
    drawingArrow,
    anchorDraft,
    finishVector,
    beginVector: (id) => {
      const clip = id ? layers.value.find((layer) => layer.id === id) : selected.value,
        canvas = canvasSize.value;
      if (!allowed() || !clip || clip.locked || clip.family === 'text' || !canvas) return false;
      if (!clip.vector && clip.drawing && clip.drawing.points.length < 2) return false;
      finishText();
      finishVector();
      drawingMode.value = false;
      options.select(clip.id);
      if (!clip.vector) options.update(clip.id, { vector: vectorForShape(clip, canvas) });
      vectorEditing.value = clip.id;
      selectedNode.value = { contour: 0, node: 0 };
      return true;
    },
    addArrow: (preset) => {
      if (!allowed()) return;
      finishText();
      finishVector();
      drawingMode.value = false;
      const clip = create('arrow');
      clip.vector = arrowVector(preset);
      clip.transform.height =
        (clip.transform.width * (canvasSize.value?.width ?? 1920)) /
        (arrowDefinition(preset).aspectRatio * (canvasSize.value?.height ?? 1080));
      options.insert(clip);
      options.select(clip.id);
    },
    drawArrow: () => {
      if (!allowed() || !canvasSize.value) return;
      finishText();
      finishVector();
      anchorDraft.value = [];
      drawingArrow.value = true;
      drawingMode.value = true;
      latestDrawingId = null;
    },
    finishDrawing: () => {
      const canvas = canvasSize.value;
      const result =
        allowed() && anchorDraft.value && canvas
          ? finishAnchorPath(anchorDraft.value, drawingSettings.value.strokeWidth, canvas)
          : null;
      drawingMode.value = false;
      if (!result) return;
      const fill = drawingSettings.value.fill ?? { kind: 'color' as const, color: drawingSettings.value.color };
      const clip = {
        ...create('arrow'),
        ...result,
        fill,
        fillColor: fill.kind === 'color' ? fill.color : drawingSettings.value.color,
      };
      options.insert(clip);
      options.select(clip.id);
    },
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
      finishVector();
      anchorDraft.value = null;
      drawingArrow.value = false;
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
      if (!allowed() || anchorDraft.value !== null) return;
      const fill = drawingSettings.value.fill ?? {
        kind: 'color' as const,
        color: drawingSettings.value.color,
      };
      const clip = {
        ...create('drawing'),
        ...value,
        fill,
        fillColor: fill.kind === 'color' ? fill.color : drawingSettings.value.color,
      };
      if (value.drawing.points.length >= 2 && canvasSize.value) {
        const canvas = canvasSize.value;
        clip.vector = {
          ...drawingToVector(
            value.drawing,
            value.transform.width * canvas.width,
            value.transform.height * canvas.height,
          ),
          endMarker: 'none',
        };
      }
      options.insert(clip);
      latestDrawingId = clip.id;
      options.select(clip.id);
    },
    updateDrawingSettings: (settings) => {
      drawingSettings.value = settings;
      if (!drawingMode.value || !latestDrawingId || options.selectedId() !== latestDrawingId) return;
      const clip = layers.value.find((layer) => layer.id === latestDrawingId);
      if (!clip?.drawing) return;
      const fill = settings.fill ?? {
        kind: 'color' as const,
        color: settings.color,
      };
      options.update(clip.id, {
        fill,
        ...(fill.kind === 'color' ? { fillColor: fill.color } : {}),
        ...(clip.vector && canvasSize.value
          ? {
              vector: {
                ...drawingToVector(
                  { ...clip.drawing, ...settings },
                  clip.transform.width * canvasSize.value.width,
                  clip.transform.height * canvasSize.value.height,
                ),
                endMarker: clip.vector.endMarker,
                startMarker: clip.vector.startMarker,
                markerSize: clip.vector.markerSize,
              },
            }
          : {}),
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
    beginElement: (id) => {
      const clip = layers.value.find((layer) => layer.id === id);
      if (!clip || clip.locked || drawingMode.value) return false;
      return clip.family === 'drawing' || clip.family === 'arrow' ? context.beginVector(id) : beginText(id);
    },
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
    if (vectorEditing.value && id !== vectorEditing.value) finishVector();
    if (latestDrawingId && id !== latestDrawingId) latestDrawingId = null;
  });
  watch(
    drawingMode,
    (active) => {
      if (!active) {
        latestDrawingId = null;
        anchorDraft.value = null;
      }
    },
    { flush: 'sync' },
  );
  watch(allowed, (value) => {
    if (!value) {
      finishText();
      finishVector();
      drawingMode.value = false;
    }
  });
  provide(ELEMENT_EDITOR, context);
  return context;
}
