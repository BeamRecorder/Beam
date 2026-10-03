<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import type { GlassPoint } from '@beam/engine/zoom/glass-highlight-types';
import { fitGlassContour } from '@beam/engine/zoom/glass-highlight';
import ResizeHandle from '~/ui/ResizeHandle/ResizeHandle.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { GlassSelectionGesture, GlassSelectionProps } from './glass-selection-types';

const props = defineProps<GlassSelectionProps>();
const emit = defineEmits<{
  (event: 'update', value: ZoomElement): void;
  (event: 'preview'): void;
}>();
const { t } = useTranslate('GlassHighlight');
const surface = ref<HTMLElement | null>(null);
const draft = shallowRef<ZoomElement | null>(null);
const drawn = shallowRef<GlassPoint[]>([]);
let gesture: GlassSelectionGesture | null = null;
const current = computed(() => draft.value ?? props.zoom);
const drawing = computed(() => props.zoom.glass?.shape === 'freehand' && !props.zoom.glass.path.length);
const radius = computed(
  () => (current.value.glass!.size * Math.min(props.canvasSize.width, props.canvasSize.height)) / 2,
);
const center = computed(() => ({
  x: current.value.focus.cx * props.canvasSize.width,
  y: current.value.focus.cy * props.canvasSize.height,
}));
const outline = computed(
  () =>
    current.value
      .glass!.path.map(
        (p, i) => `${i ? 'L' : 'M'} ${center.value.x + p.x * radius.value} ${center.value.y + p.y * radius.value}`,
      )
      .join(' ') + ' Z',
);
const drawnPath = computed(() =>
  drawn.value
    .map((p, i) => `${i ? 'L' : 'M'} ${p.x * props.canvasSize.width} ${p.y * props.canvasSize.height}`)
    .join(' '),
);
const box = computed(() => {
  const width = parseFloat(String(props.viewportStyle.width));
  const height = parseFloat(String(props.viewportStyle.height));
  const sizeX = (radius.value * 2 * width) / props.canvasSize.width;
  const sizeY = (radius.value * 2 * height) / props.canvasSize.height;
  return {
    width: `${sizeX}px`,
    height: `${sizeY}px`,
    transform: `translate3d(${current.value.focus.cx * width - sizeX / 2}px, ${current.value.focus.cy * height - sizeY / 2}px, 0)`,
  };
});
const point = (event: PointerEvent): GlassPoint => {
  const rect = surface.value!.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
};
const publishDraft = (value: ZoomElement | null) => {
  draft.value = value;
  emit('preview');
};
const cancel = () => {
  const previous = gesture;
  gesture = null;
  if (previous?.target.hasPointerCapture?.(previous.pointerId))
    previous.target.releasePointerCapture(previous.pointerId);
  drawn.value = [];
  publishDraft(null);
};
const begin = (event: PointerEvent, kind: GlassSelectionGesture['kind']) => {
  if (event.button !== 0 || props.panning || props.zoom.locked) return;
  event.stopPropagation();
  event.preventDefault();
  const target = event.currentTarget as Element;
  gesture = { pointerId: event.pointerId, target, kind, origin: point(event), zoom: props.zoom, points: [] };
  target.setPointerCapture(event.pointerId);
  surface.value?.focus({ preventScroll: true });
  move(event);
};
const move = (event: PointerEvent) => {
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  const p = point(event),
    zoom = gesture.zoom;
  if (gesture.kind === 'draw') {
    const previous = gesture.points.at(-1);
    if (
      !previous ||
      Math.hypot((p.x - previous.x) * props.canvasSize.width, (p.y - previous.y) * props.canvasSize.height) >= 2
    ) {
      if (gesture.points.length < 4096) gesture.points.push(p);
      drawn.value = [...gesture.points];
      const contour = fitGlassContour(gesture.points, props.canvasSize.width, props.canvasSize.height);
      if (contour)
        publishDraft({
          ...zoom,
          focus: contour.focus,
          glass: { ...zoom.glass!, size: contour.size, path: contour.path },
        });
    }
  } else if (gesture.kind === 'move') {
    publishDraft({
      ...zoom,
      focus: {
        cx: Math.min(1, Math.max(0, zoom.focus.cx + p.x - gesture.origin.x)),
        cy: Math.min(1, Math.max(0, zoom.focus.cy + p.y - gesture.origin.y)),
      },
    });
  } else {
    const distance = Math.hypot(
      (p.x - zoom.focus.cx) * props.canvasSize.width,
      (p.y - zoom.focus.cy) * props.canvasSize.height,
    );
    // Handles sit on the bounding square's corners.
    const size = Math.min(
      4,
      Math.max(0.02, (distance * Math.SQRT2) / Math.min(props.canvasSize.width, props.canvasSize.height)),
    );
    publishDraft({ ...zoom, glass: { ...zoom.glass!, size } });
  }
};
const finish = (event: PointerEvent) => {
  if (event.type === 'pointercancel' || event.type === 'lostpointercapture') {
    cancel();
    return;
  }
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  move(event);
  const value = draft.value;
  if (
    value &&
    !props.zoom.locked &&
    (Math.abs(value.focus.cx - props.zoom.focus.cx) > 1e-6 ||
      Math.abs(value.focus.cy - props.zoom.focus.cy) > 1e-6 ||
      Math.abs(value.glass!.size - props.zoom.glass!.size) > 1e-6 ||
      value.glass!.path !== props.zoom.glass!.path)
  )
    emit('update', value);
  cancel();
};
const keyboard = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.stopPropagation();
    cancel();
    return;
  }
  if (
    !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) ||
    props.zoom.locked ||
    props.panning ||
    drawing.value
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  const step = event.shiftKey ? 10 : 1;
  const focus = { ...props.zoom.focus };
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    focus.cx += (event.key === 'ArrowLeft' ? -step : step) / props.canvasSize.width;
  else focus.cy += (event.key === 'ArrowUp' ? -step : step) / props.canvasSize.height;
  emit('update', {
    ...props.zoom,
    focus: { cx: Math.min(1, Math.max(0, focus.cx)), cy: Math.min(1, Math.max(0, focus.cy)) },
  });
};
watch(() => [props.zoom.id, props.zoom.locked, props.zoom.glass?.shape, props.panning], cancel);
onBeforeUnmount(cancel);
defineExpose({ draft });
</script>

<template>
  <div
    ref="surface"
    class="glass-highlight-selection"
    :class="{ drawing: drawing && !panning && !zoom.locked }"
    :style="viewportStyle"
    tabindex="0"
    :aria-label="drawing ? t('drawHint') : t('moveHint')"
    @keydown="keyboard"
    @pointerdown="drawing && begin($event, 'draw')"
    @pointermove="move"
    @pointerup="finish"
    @pointercancel="cancel"
    @lostpointercapture="cancel"
  >
    <svg :viewBox="`0 0 ${canvasSize.width} ${canvasSize.height}`" preserveAspectRatio="none" aria-hidden="true">
      <path v-if="drawn.length" :d="drawnPath" />
      <circle v-else-if="current.glass?.shape === 'circle'" :cx="center.x" :cy="center.y" :r="radius" />
      <path v-else-if="!drawing" :d="outline" />
    </svg>
    <span v-if="drawing && !drawn.length" class="draw-hint">{{ t('drawHint') }}</span>
    <div
      v-if="!drawing"
      class="glass-selection-box"
      :class="{ disabled: panning || zoom.locked }"
      :style="box"
      @pointerdown="begin($event, 'move')"
      @pointermove="move"
      @pointerup="finish"
      @pointercancel="cancel"
      @lostpointercapture="cancel"
    >
      <ResizeHandle
        v-if="!zoom.locked && !panning"
        :corners="['top-left', 'top-right', 'bottom-left', 'bottom-right']"
        @resize-start="(_corner, event) => begin(event, 'resize')"
        @resize-move="(_corner, event) => move(event)"
        @resize-end="(_corner, event) => finish(event)"
      />
    </div>
  </div>
</template>

<style scoped>
.glass-highlight-selection {
  position: absolute;
  z-index: 22;
  pointer-events: none;
  outline: none;
}
.glass-highlight-selection.drawing {
  pointer-events: auto;
  cursor: crosshair;
  touch-action: none;
}
svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
svg :is(path, circle) {
  fill: none;
  stroke: var(--color-primary);
  stroke-width: 1.5px;
  vector-effect: non-scaling-stroke;
}
.glass-selection-box {
  position: absolute;
  left: 0;
  top: 0;
  cursor: move;
  pointer-events: auto;
  touch-action: none;
}
.glass-selection-box.disabled {
  pointer-events: none;
}
.glass-highlight-selection:focus-visible .glass-selection-box {
  outline: 1px dashed var(--color-primary);
  outline-offset: 4px;
}
.draw-hint {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translate3d(-50%, 0, 0);
  padding: 6px 10px;
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  white-space: nowrap;
  pointer-events: none;
}
</style>
