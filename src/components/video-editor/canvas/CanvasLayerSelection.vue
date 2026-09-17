<script setup lang="ts">
import { computed, onBeforeUnmount, ref, type CSSProperties } from 'vue';
import { RotateCw } from '@lucide/vue';
import ResizeHandle from '~/ui/ResizeHandle/ResizeHandle.vue';
import type { ResizeCorner, ResizeHandlePosition, ResizeHandlePositions } from '~/ui/ResizeHandle/types';
import { rotationFromPointer, rotationPointerAngle } from './rotation-gesture';

const props = defineProps<{
  viewportStyle: CSSProperties;
  handleStyle: CSSProperties;
  muted?: boolean;
  resizeCorners?: ResizeCorner[];
  resizeHandlePositions?: ResizeHandlePositions;
  perspectiveCorners?: [ResizeHandlePosition, ResizeHandlePosition, ResizeHandlePosition, ResizeHandlePosition];
  rotation?: number;
  rotatable?: boolean;
  rotateLabel?: string;
}>();
const emit = defineEmits<{
  (event: 'pointer-down', value: PointerEvent): void;
  (event: 'pointer-move', value: PointerEvent): void;
  (event: 'pointer-up', value: PointerEvent): void;
  (event: 'resize-start', corner: ResizeCorner, value: PointerEvent): void;
  (event: 'resize-move', value: PointerEvent): void;
  (event: 'resize-end', value: PointerEvent): void;
  (event: 'rotate-start'): void;
  (event: 'rotate', value: number): void;
  (event: 'rotate-end', value: number): void;
}>();
const selection = ref<HTMLElement | null>(null);
let rotationDrag: {
  pointerId: number;
  center: ResizeHandlePosition;
  initialPointerAngle: number;
  initialRotation: number;
  currentRotation: number;
} | null = null;
const perspectivePolygon = computed(() => props.perspectiveCorners?.map((point) => `${point.x},${point.y}`).join(' '));
const perspectiveClipPath = computed(() =>
  props.perspectiveCorners?.map((point) => `${point.x}px ${point.y}px`).join(', '),
);
const beginRotation = (event: PointerEvent) => {
  if (event.button !== 0 || !selection.value) return;
  event.preventDefault();
  const bounds = selection.value.getBoundingClientRect();
  const center = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  rotationDrag = {
    pointerId: event.pointerId,
    center,
    initialPointerAngle: rotationPointerAngle(center, { x: event.clientX, y: event.clientY }),
    initialRotation: props.rotation ?? 0,
    currentRotation: props.rotation ?? 0,
  };
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  emit('rotate-start');
};
const moveRotation = (event: PointerEvent) => {
  if (!rotationDrag || event.pointerId !== rotationDrag.pointerId) return;
  rotationDrag.currentRotation = rotationFromPointer(
    rotationDrag.initialRotation,
    rotationDrag.initialPointerAngle,
    rotationDrag.center,
    { x: event.clientX, y: event.clientY },
    event.shiftKey,
  );
  emit('rotate', rotationDrag.currentRotation);
};
const endRotation = (event: PointerEvent) => {
  if (!rotationDrag || event.pointerId !== rotationDrag.pointerId) return;
  moveRotation(event);
  const rotation = rotationDrag.currentRotation;
  rotationDrag = null;
  emit('rotate-end', rotation);
};
onBeforeUnmount(() => {
  rotationDrag = null;
});
</script>

<template>
  <div class="transform-selection-viewport" :style="viewportStyle">
    <div
      ref="selection"
      class="webcam-selection"
      :class="{ 'is-muted': muted, 'has-perspective': perspectiveCorners }"
      :style="handleStyle"
      @pointerdown="emit('pointer-down', $event)"
      @pointermove="emit('pointer-move', $event)"
      @pointerup="emit('pointer-up', $event)"
      @pointercancel="emit('pointer-up', $event)"
    >
      <div
        v-if="perspectiveCorners"
        class="perspective-hit-area"
        :style="{ clipPath: `polygon(${perspectiveClipPath})` }"
        @pointerdown.stop="emit('pointer-down', $event)"
        @pointermove.stop="emit('pointer-move', $event)"
        @pointerup.stop="emit('pointer-up', $event)"
        @pointercancel.stop="emit('pointer-up', $event)"
      />
      <svg v-if="perspectiveCorners" class="perspective-border" aria-hidden="true">
        <polygon :points="perspectivePolygon" vector-effect="non-scaling-stroke" />
      </svg>
      <button
        v-if="rotatable && !perspectiveCorners"
        type="button"
        class="rotation-handle"
        :aria-label="rotateLabel"
        :title="rotateLabel"
        @pointerdown.stop="beginRotation"
        @pointermove.stop="moveRotation"
        @pointerup.stop="endRotation"
        @pointercancel.stop="endRotation"
        @lostpointercapture="endRotation"
      >
        <RotateCw :size="13" aria-hidden="true" />
      </button>
      <ResizeHandle
        :corners="resizeCorners"
        :positions="resizeHandlePositions"
        @resize-start="(corner, event) => emit('resize-start', corner, event)"
        @resize-move="(_corner, event) => emit('resize-move', event)"
        @resize-end="(_corner, event) => emit('resize-end', event)"
      />
    </div>
  </div>
</template>

<style scoped>
.transform-selection-viewport {
  position: absolute;
  z-index: 2;
  overflow: visible;
  pointer-events: none;
}
.webcam-selection {
  position: absolute;
  border: 2px solid var(--color-primary);
  box-sizing: border-box;
  cursor: move;
  pointer-events: auto;
  transition: opacity var(--fast) ease;
}
.webcam-selection.is-muted {
  opacity: 0.16;
}
.webcam-selection.has-perspective {
  border: 0;
  pointer-events: none;
}
.perspective-hit-area {
  position: absolute;
  inset: 0;
  cursor: move;
  pointer-events: auto;
}
.perspective-border {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
.perspective-border polygon {
  fill: color-mix(in srgb, var(--color-primary) 5%, transparent);
  stroke: var(--color-primary);
  stroke-width: 2px;
}
.rotation-handle {
  position: absolute;
  left: 50%;
  top: -38px;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 2px solid var(--color-bg-element);
  border-radius: var(--radius-full);
  background: var(--color-primary);
  color: var(--color-primary-foreground, #fff);
  transform: translateX(-50%);
  cursor: grab;
  pointer-events: auto;
  touch-action: none;
}
.rotation-handle::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 100%;
  width: 2px;
  height: 14px;
  background: var(--color-primary);
  transform: translateX(-50%);
}
.rotation-handle:active {
  cursor: grabbing;
}
</style>
