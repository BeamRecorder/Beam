<script setup lang="ts">
import CanvasLayerSelection from '../editor/canvas/CanvasLayerSelection.vue';
import type { ScreenshotGroupSelectionProps } from './screenshot-group-selection-types';
import type { ResizeCorner } from '~/ui/ResizeHandle/types';
defineProps<ScreenshotGroupSelectionProps>();
const emit = defineEmits<{
  start: [event: PointerEvent];
  resize: [corner: ResizeCorner, event: PointerEvent];
  move: [event: PointerEvent];
  end: [];
}>();
</script>
<template>
  <CanvasLayerSelection
    data-screenshot-group
    :viewport-style="{ inset: '0' }"
    :handle-style="{
      left: '0',
      top: '0',
      width: `${bounds.width * 100}%`,
      height: `${bounds.height * 100}%`,
      transform: `translate3d(${bounds.x * viewport.width}px, ${bounds.y * viewport.height}px, 0)`,
    }"
    :muted="muted"
    @pointer-down="emit('start', $event)"
    @pointer-move="emit('move', $event)"
    @pointer-up="emit('end')"
    @resize-start="(corner, event) => emit('resize', corner, event)"
    @resize-move="emit('move', $event)"
    @resize-end="emit('end')"
  />
</template>
