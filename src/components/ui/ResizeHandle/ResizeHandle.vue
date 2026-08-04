<script setup lang="ts">
import type { ResizeCorner } from './types'
export type { ResizeCorner }

withDefaults(defineProps<{ corners?: ResizeCorner[]; disabled?: boolean }>(), {
  corners: () => ['top-left', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left'],
  disabled: false,
})

const emit = defineEmits<{
  (e: 'resize-start', corner: ResizeCorner, event: PointerEvent): void
  (e: 'resize-move', corner: ResizeCorner, event: PointerEvent): void
  (e: 'resize-end', corner: ResizeCorner, event: PointerEvent): void
}>()

const start = (corner: ResizeCorner, event: PointerEvent) => {
  if ((event.currentTarget as HTMLElement).setPointerCapture)
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  emit('resize-start', corner, event)
}
</script>

<template>
  <button
    v-for="corner in corners"
    :key="corner"
    type="button"
    class="resize-handle"
    :class="`is-${corner}`"
    :disabled="disabled"
    :aria-label="`Resize from ${corner}`"
    @pointerdown.stop="start(corner, $event)"
    @pointermove="emit('resize-move', corner, $event)"
    @pointerup="emit('resize-end', corner, $event)"
    @pointercancel="emit('resize-end', corner, $event)"
  />
</template>

<style scoped>
.resize-handle {
  position: absolute;
  width: 14px;
  height: 14px;
  padding: 0;
  border: 2px solid var(--color-bg-element);
  border-radius: 3px;
  background: var(--color-primary);
  z-index: 1;
}
.is-top-left {
  top: -7px;
  left: -7px;
  cursor: nwse-resize;
}
.is-top {
  top: -5px;
  left: 50%;
  width: 22px;
  height: 10px;
  transform: translateX(-50%);
  cursor: ns-resize;
}
.is-top-right {
  top: -7px;
  right: -7px;
  cursor: nesw-resize;
}
.is-right {
  top: 50%;
  right: -5px;
  width: 10px;
  height: 22px;
  transform: translateY(-50%);
  cursor: ew-resize;
}
.is-bottom-left {
  bottom: -7px;
  left: -7px;
  cursor: nesw-resize;
}
.is-bottom {
  bottom: -5px;
  left: 50%;
  width: 22px;
  height: 10px;
  transform: translateX(-50%);
  cursor: ns-resize;
}
.is-bottom-right {
  right: -7px;
  bottom: -7px;
  cursor: nwse-resize;
}
.is-left {
  top: 50%;
  left: -5px;
  width: 10px;
  height: 22px;
  transform: translateY(-50%);
  cursor: ew-resize;
}
</style>
