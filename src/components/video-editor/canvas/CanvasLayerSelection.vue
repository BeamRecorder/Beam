<script setup lang="ts">
import { computed, type CSSProperties } from 'vue';
import ResizeHandle from '~/ui/ResizeHandle/ResizeHandle.vue';
import type { ResizeCorner, ResizeHandlePosition, ResizeHandlePositions } from '~/ui/ResizeHandle/types';

const props = defineProps<{
  viewportStyle: CSSProperties;
  handleStyle: CSSProperties;
  muted?: boolean;
  resizeCorners?: ResizeCorner[];
  resizeHandlePositions?: ResizeHandlePositions;
  perspectiveCorners?: [ResizeHandlePosition, ResizeHandlePosition, ResizeHandlePosition, ResizeHandlePosition];
}>();
const emit = defineEmits<{
  (event: 'pointer-down', value: PointerEvent): void;
  (event: 'pointer-move', value: PointerEvent): void;
  (event: 'pointer-up', value: PointerEvent): void;
  (event: 'resize-start', corner: ResizeCorner, value: PointerEvent): void;
  (event: 'resize-move', value: PointerEvent): void;
  (event: 'resize-end', value: PointerEvent): void;
}>();
const perspectivePolygon = computed(() => props.perspectiveCorners?.map((point) => `${point.x},${point.y}`).join(' '));
const perspectiveClipPath = computed(() =>
  props.perspectiveCorners?.map((point) => `${point.x}px ${point.y}px`).join(', '),
);
</script>

<template>
  <div class="transform-selection-viewport" :style="viewportStyle">
    <div
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
</style>
