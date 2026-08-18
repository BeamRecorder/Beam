<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import ResizeHandle from '~/ui/ResizeHandle/ResizeHandle.vue';
import type { ResizeCorner } from '~/ui/ResizeHandle/types';
import type { CursorCanvasBounds } from '../properties/cursor/cursor-rendering';

const props = defineProps<{ bounds: CursorCanvasBounds; resizing: boolean; isAtLimit: boolean }>();
const emit = defineEmits<{
  (event: 'resize-start', corner: ResizeCorner, pointer: PointerEvent): void;
  (event: 'resize-move', pointer: PointerEvent): void;
  (event: 'resize-end'): void;
}>();
const blockedDragging = ref(false);
const beginBlockedDrag = (event: PointerEvent) => {
  if (event.button !== 0) return;
  emit('resize-end');
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  blockedDragging.value = true;
};
const endBlockedDrag = () => {
  blockedDragging.value = false;
};
onBeforeUnmount(() => {
  endBlockedDrag();
  emit('resize-end');
});
const style = computed(() => ({
  left: `${props.bounds.x}px`,
  top: `${props.bounds.y}px`,
  width: `${props.bounds.width}px`,
  height: `${props.bounds.height}px`,
}));
</script>

<template>
  <div
    class="cursor-canvas-selection"
    :class="{ 'is-resizing': resizing, 'is-blocked-drag': blockedDragging }"
    :style
    @pointerdown.stop.prevent="beginBlockedDrag"
    @pointerup.stop="endBlockedDrag"
    @pointercancel.stop="endBlockedDrag"
  >
    <ResizeHandle
      :corners="['top-left', 'top-right', 'bottom-right', 'bottom-left']"
      :is-at-limit="isAtLimit"
      @resize-start="(corner, event) => emit('resize-start', corner, event)"
      @resize-move="(_corner, event) => emit('resize-move', event)"
      @resize-end="emit('resize-end')"
    />
  </div>
</template>

<style scoped>
.cursor-canvas-selection {
  position: absolute;
  z-index: 40;
  box-sizing: border-box;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  pointer-events: auto;
}
.cursor-canvas-selection.is-resizing {
  border-width: 2px;
}
.cursor-canvas-selection.is-blocked-drag {
  cursor: not-allowed;
}
</style>
