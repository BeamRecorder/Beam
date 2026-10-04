<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { MAX_VECTOR_NODES } from '@beam/engine/shared/shape-vector-schema';
import { finishAnchorPath } from '@beam/engine/shared/shape-vector-anchors';
import { snapVectorPoint } from '@beam/engine/shared/shape-vector-hit';
import { normalizeShapeLayerStyle } from '@beam/engine/shared/shape-layer-style';
import { drawVector } from '@beam/runtime/composition/shape/render-vector';
import type { ShapeClip } from '@beam/engine/shared/composition-types';
import type { VectorPoint, VectorSnap } from '@beam/engine/shared/shape-vector-types';
import type { ElementCamera, ElementViewport } from './element-editor-types';
import type { AnchorDrag } from './vector-overlay-types';
import { elementMatrix, unprojectElementPoint } from './element-projection';
import { useElementEditor } from './useElementEditor';
import { useTranslate } from '~/i18n/useTranslate';
import { useCanvasControlContrast } from '~/ui/ResizeHandle/useCanvasControlContrast';
const vCanvasControlContrast = useCanvasControlContrast();
const props = defineProps<{
  viewport: ElementViewport;
  camera?: ElementCamera;
  surfaceSize: { width: number; height: number };
}>();
const editor = useElementEditor();
const { t } = useTranslate('Elements');
const surface = ref<HTMLElement | null>(null);
const preview = ref<HTMLCanvasElement | null>(null);
const cursor = ref<VectorPoint | null>(null);
const alignmentGuides = ref<VectorSnap['guides']>([]);
const dragging = ref(false);
let drag: AnchorDrag | null = null;
let nextId = 0;
const nodes = computed(() => editor?.anchorDraft.value ?? []);
const last = computed(() => nodes.value.at(-1));
const frame = computed(() => ({
  width: `${props.viewport.width}px`,
  height: `${props.viewport.height}px`,
  transform: elementMatrix(props.viewport, props.viewport, props.camera),
}));
const distance = (a: VectorPoint, b: VectorPoint) =>
  Math.hypot((a.x - b.x) * props.viewport.width, (a.y - b.y) * props.viewport.height);
const pointAt = (event: PointerEvent) => {
  const bounds = surface.value!.getBoundingClientRect();
  if (!bounds.width || !bounds.height || props.viewport.width <= 0 || props.viewport.height <= 0) return null;
  const point = unprojectElementPoint(
    {
      x: ((event.clientX - bounds.left) * props.surfaceSize.width) / bounds.width,
      y: ((event.clientY - bounds.top) * props.surfaceSize.height) / bounds.height,
    },
    props.viewport,
    props.camera,
  );
  const position = {
    x: Math.max(0, Math.min(1, point.x)) * props.viewport.width,
    y: Math.max(0, Math.min(1, point.y)) * props.viewport.height,
  };
  const snapped = snapVectorPoint(
    position,
    (drag ? nodes.value.slice(0, -1) : nodes.value).map((node) => ({
      x: node.x * props.viewport.width,
      y: node.y * props.viewport.height,
    })),
    event.altKey ? 0 : 6,
  );
  alignmentGuides.value = event.altKey ? [] : snapped.guides;
  return { x: snapped.point.x / props.viewport.width, y: snapped.point.y / props.viewport.height };
};
const paint = () => {
  const canvas = preview.value,
    ctx = canvas?.getContext('2d');
  const size = editor?.canvasSize.value;
  if (!canvas || !ctx || !editor || !size) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(props.viewport.width * dpr));
  const height = Math.max(1, Math.round(props.viewport.height * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, props.viewport.width, props.viewport.height);
  const authored = nodes.value;
  const ghost =
    !dragging.value &&
    cursor.value &&
    last.value &&
    distance(cursor.value, last.value) > 1 &&
    authored.length < MAX_VECTOR_NODES
      ? [{ ...cursor.value, id: 'preview-cursor', mode: 'corner' as const }]
      : [];
  const result = finishAnchorPath([...authored, ...ghost], editor.drawingSettings.value.strokeWidth, size);
  if (!result) return;
  const settings = editor.drawingSettings.value;
  const style = normalizeShapeLayerStyle({
    family: 'arrow',
    preset: 'arrow',
    vector: result.vector,
    fill: settings.fill,
    fillColor: settings.color,
  });
  drawVector(
    ctx,
    { ...style, ...result } as ShapeClip,
    {
      x: result.transform.x * props.viewport.width,
      y: result.transform.y * props.viewport.height,
      width: result.transform.width * props.viewport.width,
      height: result.transform.height * props.viewport.height,
    },
    style,
    Math.min(props.viewport.width, props.viewport.height) / 1080,
  );
};
const release = () => {
  const current = drag;
  drag = null;
  dragging.value = false;
  alignmentGuides.value = [];
  if (current?.target.hasPointerCapture(current.pointerId)) current.target.releasePointerCapture(current.pointerId);
};
const start = (event: PointerEvent) => {
  if (event.button !== 0 || drag || !editor || editor.anchorDraft.value === null) return;
  const point = pointAt(event);
  if (!point || nodes.value.length >= MAX_VECTOR_NODES || (last.value && distance(last.value, point) < 2)) return;
  const target = event.currentTarget as HTMLElement;
  drag = { pointerId: event.pointerId, target, previous: nodes.value };
  dragging.value = true;
  cursor.value = null;
  editor.anchorDraft.value = [...nodes.value, { ...point, id: `anchor-${nextId++}`, mode: 'corner' }];
  target.setPointerCapture(event.pointerId);
  target.focus({ preventScroll: true });
};
const move = (event: PointerEvent) => {
  if (drag && event.pointerId !== drag.pointerId) return;
  const point = pointAt(event);
  if (!point) return;
  if (!drag) {
    cursor.value = point;
    return;
  }
  const node = last.value!;
  if (distance(node, point) < 3) {
    editor!.anchorDraft.value = [...nodes.value.slice(0, -1), { id: node.id, x: node.x, y: node.y, mode: 'corner' }];
    return;
  }
  editor!.anchorDraft.value = [
    ...nodes.value.slice(0, -1),
    { ...node, mode: 'smooth', out: point, in: { x: 2 * node.x - point.x, y: 2 * node.y - point.y } },
  ];
};
const end = (event: PointerEvent) => {
  if (drag?.pointerId !== event.pointerId) return;
  move(event);
  release();
};
const cancelDrag = () => {
  if (drag && editor) editor.anchorDraft.value = drag.previous;
  release();
};
const finish = () => {
  release();
  editor?.finishDrawing();
};
const keydown = (event: KeyboardEvent) => {
  if (!editor || !['Enter', 'Escape', 'Backspace', 'Delete'].includes(event.key)) return;
  event.stopPropagation();
  event.preventDefault();
  if (event.key === 'Enter') finish();
  else if (event.key === 'Escape') {
    cancelDrag();
    editor!.drawingMode.value = false;
  } else {
    if (drag) cancelDrag();
    else editor.anchorDraft.value = nodes.value.slice(0, -1);
    cursor.value = null;
  }
};
watch([nodes, cursor, dragging, () => props.viewport, () => props.camera, () => editor?.drawingSettings.value], paint, {
  deep: true,
  flush: 'post',
});
onMounted(() => {
  surface.value?.focus({ preventScroll: true });
  paint();
});
onBeforeUnmount(release);
</script>
<template>
  <div
    v-if="editor"
    ref="surface"
    class="anchor-input"
    tabindex="0"
    role="application"
    :aria-label="t('drawArrowHint')"
    @pointerdown.prevent.stop="start"
    @pointermove.stop="move"
    @pointerup.stop="end"
    @pointercancel.stop="cancelDrag"
    @lostpointercapture="cancelDrag"
    @dblclick.prevent.stop="finish"
    @pointerleave="!dragging && (cursor = null)"
    @keydown="keydown"
  >
    <canvas ref="preview" class="preview" :style="frame" />
    <svg
      v-canvas-control-contrast
      class="guides"
      :style="frame"
      :width="viewport.width"
      :height="viewport.height"
      aria-hidden="true"
    >
      <line
        v-for="(guide, index) in alignmentGuides"
        :key="`alignment-${index}`"
        class="alignment-guide"
        :x1="guide.from.x"
        :y1="guide.from.y"
        :x2="guide.to.x"
        :y2="guide.to.y"
      />
      <template v-if="last">
        <template v-for="handle in [last.in, last.out].filter(Boolean)" :key="`${handle!.x}:${handle!.y}`">
          <line
            :x1="last.x * viewport.width"
            :y1="last.y * viewport.height"
            :x2="handle!.x * viewport.width"
            :y2="handle!.y * viewport.height"
          />
          <circle v-canvas-control-contrast :cx="handle!.x * viewport.width" :cy="handle!.y * viewport.height" r="3" />
        </template>
      </template>
      <rect
        v-for="node in nodes"
        v-canvas-control-contrast
        :key="node.id"
        :x="node.x * viewport.width - 3"
        :y="node.y * viewport.height - 3"
        width="6"
        height="6"
        :class="{ active: node === last }"
      />
    </svg>
  </div>
</template>
<style scoped>
.anchor-input {
  position: absolute;
  inset: 0;
  pointer-events: auto;
  cursor: crosshair;
  touch-action: none;
  outline: none;
  overflow: hidden;
}
.anchor-input:focus-visible {
  outline: 1px solid var(--color-primary);
  outline-offset: -1px;
}
.preview,
.guides {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  pointer-events: none;
}
.guides {
  overflow: visible;
  stroke: var(--canvas-control-ink, var(--text-primary));
  stroke-width: 1;
  fill: var(--canvas-control-halo, var(--color-bg-surface));
}
.guides line,
.guides rect,
.guides circle {
  vector-effect: non-scaling-stroke;
}
.guides rect,
.guides circle {
  stroke: var(--canvas-control-ink, var(--text-primary));
  fill: var(--canvas-control-ink, var(--text-primary));
  stroke: var(--canvas-control-halo, var(--color-bg-surface));
}
.guides .active {
  stroke-width: 2;
}
.alignment-guide {
  stroke-dasharray: 4 3;
}
</style>
