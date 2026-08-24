<script setup lang="ts">
import type { CSSProperties } from 'vue';
import ResizeHandle from '~/ui/ResizeHandle/ResizeHandle.vue';
import type { ResizeCorner } from '~/ui/ResizeHandle/types';

defineProps<{
  viewportStyle: CSSProperties;
  handleStyle: CSSProperties;
  muted?: boolean;
  resizeCorners?: ResizeCorner[];
}>();
const emit = defineEmits<{
  (event: 'pointer-down', value: PointerEvent): void;
  (event: 'pointer-move', value: PointerEvent): void;
  (event: 'pointer-up', value: PointerEvent): void;
  (event: 'resize-start', corner: ResizeCorner, value: PointerEvent): void;
  (event: 'resize-move', value: PointerEvent): void;
  (event: 'resize-end', value: PointerEvent): void;
}>();
</script>

<template>
  <div class="transform-selection-viewport" :style="viewportStyle">
    <div
      class="webcam-selection"
      :class="{ 'is-muted': muted }"
      :style="handleStyle"
      @pointerdown="emit('pointer-down', $event)"
      @pointermove="emit('pointer-move', $event)"
      @pointerup="emit('pointer-up', $event)"
      @pointercancel="emit('pointer-up', $event)"
    >
      <ResizeHandle
        :corners="resizeCorners"
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
  overflow: hidden;
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
</style>
