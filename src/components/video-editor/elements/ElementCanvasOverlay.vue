<script setup lang="ts">
import { beginPropertyInteraction, endPropertyInteraction } from '~/composables/property-interaction';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import CaptionInlineEditor from '../canvas/CaptionInlineEditor.vue';
import { useElementEditor } from './useElementEditor';
import { elementTextCaption, elementTextLayout } from '~/media/shared/element-text';
import { elementTextCanvas } from '../composition/shape/render-element-content';
import { applyCanvasCaptionFont } from '~/media/shared/caption-font';
import { finishDrawing, MAX_DRAWING_POINTS, traceFreehand } from '~/media/shared/freehand';
import type { DrawingPoint } from '~/media/shared/element-types';
import type { ElementCamera, ElementViewport } from './element-editor-types';
import { elementMatrix, unprojectElementPoint } from './element-projection';
import { useTranslate } from '~/i18n/useTranslate';
const props = defineProps<{
  viewport: ElementViewport;
  camera?: ElementCamera;
  surfaceSize: { width: number; height: number };
}>();
const editor = useElementEditor();
const { t } = useTranslate('Elements');
const surface = ref<HTMLElement | null>(null);
const preview = ref<HTMLCanvasElement | null>(null);
let pointerId: number | null = null;
let points: DrawingPoint[] = [];
const measure = document.createElement('canvas').getContext('2d');
const textLayout = computed(() => {
  const clip = editor?.editing.value;
  if (!clip) return null;
  const canonical = elementTextCanvas(props.viewport);
  if (measure && clip.text) applyCanvasCaptionFont(measure, clip.text.style);
  const layout = elementTextLayout(clip, canonical, measure ? (text) => measure.measureText(text).width : undefined);
  const rect = {
    x: props.viewport.x + clip.transform.x * props.viewport.width,
    y: props.viewport.y + clip.transform.y * props.viewport.height,
    width: clip.transform.width * props.viewport.width,
    height: clip.transform.height * props.viewport.height,
  };
  return {
    clip: elementTextCaption(clip),
    frame: {
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      transform: elementMatrix(rect, props.viewport, props.camera, clip.rotation),
    },
    layout: {
      left: `${(layout.x - clip.transform.x) * props.viewport.width}px`,
      top: `${(layout.y - clip.transform.y) * props.viewport.height}px`,
      width: `${layout.width * props.viewport.width}px`,
      height: `${Math.max(layout.height * props.viewport.height, (clip.text!.style.fontSize * props.viewport.width) / canonical.width)}px`,
    },
    scale: props.viewport.width / canonical.width,
  };
});
const drawingStyle = computed(() => ({
  width: `${props.viewport.width}px`,
  height: `${props.viewport.height}px`,
  transform: elementMatrix(props.viewport, props.viewport, props.camera),
}));
const pointAt = (event: PointerEvent) => {
  const bounds = surface.value!.getBoundingClientRect();
  return unprojectElementPoint(
    {
      x: ((event.clientX - bounds.left) * props.surfaceSize.width) / bounds.width,
      y: ((event.clientY - bounds.top) * props.surfaceSize.height) / bounds.height,
    },
    props.viewport,
    props.camera,
  );
};
const paint = () => {
  const canvas = preview.value,
    ctx = canvas?.getContext('2d');
  if (!canvas || !ctx || !editor) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(props.viewport.width * dpr)),
    height = Math.max(1, Math.round(props.viewport.height * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, props.viewport.width, props.viewport.height);
  // clearRect clears pixels, but keeps the previous path alive for stroke().
  if (!points.length) return;
  const settings = editor.drawingSettings.value;
  traceFreehand(ctx, { points, ...settings }, props.viewport.width, props.viewport.height);
  ctx.strokeStyle = settings.color;
  ctx.lineWidth = (settings.strokeWidth * Math.min(props.viewport.width, props.viewport.height)) / 1080;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.stroke();
};
const addPoint = (event: PointerEvent) => {
  if (points.length >= MAX_DRAWING_POINTS) points = points.filter((_point, index) => index % 2 === 0);
  const point = pointAt(event),
    last = points.at(-1);
  if (last && Math.hypot((point.x - last.x) * props.viewport.width, (point.y - last.y) * props.viewport.height) < 0.75)
    return;
  // The editable drawing stays within the output canvas, including pointer capture outside it.
  points.push({ x: Math.max(0, Math.min(1, point.x)), y: Math.max(0, Math.min(1, point.y)) });
};
const start = (event: PointerEvent) => {
  if (event.button !== 0 || pointerId !== null || !editor?.drawingMode.value) return;
  event.preventDefault();
  event.stopPropagation();
  beginPropertyInteraction();
  pointerId = event.pointerId;
  (event.currentTarget as Element).setPointerCapture(pointerId);
  (event.currentTarget as HTMLElement).focus({ preventScroll: true });
  points = [];
  addPoint(event);
  paint();
};
const move = (event: PointerEvent) => {
  if (event.pointerId !== pointerId) return;
  const samples = event.getCoalescedEvents?.() ?? [];
  for (const sample of samples.length ? samples : [event]) addPoint(sample);
  paint();
};
const end = (event?: PointerEvent) => {
  if (pointerId === null || (event && event.pointerId !== pointerId)) return;
  if (event) addPoint(event);
  const result = finishDrawing(points, editor!.drawingSettings.value, props.viewport);
  pointerId = null;
  points = [];
  paint();
  if (result) editor!.addDrawing(result);
  endPropertyInteraction();
};
const cancel = () => {
  if (pointerId !== null) endPropertyInteraction();
  pointerId = null;
  points = [];
  paint();
};
const keydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return;
  event.stopPropagation();
  event.preventDefault();
  if (pointerId !== null) cancel();
  else if (editor) editor.drawingMode.value = false;
};
watch(
  () => editor?.drawingMode.value,
  (drawing) => {
    if (!drawing) cancel();
  },
);
onBeforeUnmount(cancel);
</script>
<template>
  <div ref="surface" class="element-overlay">
    <div
      v-if="editor?.drawingMode.value"
      class="drawing-input"
      tabindex="0"
      role="application"
      :aria-label="t('drawHint')"
      @pointerdown.stop="start"
      @pointermove.stop="move"
      @pointerup.stop="end"
      @pointercancel.stop="cancel"
      @lostpointercapture="cancel"
      @keydown="keydown"
    >
      <canvas ref="preview" class="drawing-preview" :style="drawingStyle" />
    </div>
    <div v-if="textLayout && editor" class="text-frame" :style="textLayout.frame">
      <CaptionInlineEditor
        :max-length="10000"
        :key="textLayout.clip.id"
        :clip="textLayout.clip"
        :viewport-style="{ inset: '0' }"
        :layout-style="textLayout.layout"
        :render-scale="textLayout.scale"
        warning-placement="above"
        @update="editor.updateText"
        @finish="editor.finishText"
        @cancel="editor.cancelText"
      />
    </div>
  </div>
</template>
<style scoped>
.element-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 9;
}
.drawing-input {
  position: absolute;
  inset: 0;
  pointer-events: auto;
  cursor: crosshair;
  touch-action: none;
  outline: none;
  overflow: hidden;
}
.drawing-input:focus-visible {
  outline: 1px solid var(--color-primary);
  outline-offset: -1px;
}
.text-frame,
.drawing-preview {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
</style>
