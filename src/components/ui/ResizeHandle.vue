<script setup lang="ts">
export type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

withDefaults(defineProps<{ corners?: ResizeCorner[]; disabled?: boolean }>(), {
  corners: () => ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
  disabled: false,
})

const emit = defineEmits<{
  (e: 'resize-start', corner: ResizeCorner, event: PointerEvent): void
  (e: 'resize-move', corner: ResizeCorner, event: PointerEvent): void
  (e: 'resize-end', corner: ResizeCorner, event: PointerEvent): void
}>()

const start = (corner: ResizeCorner, event: PointerEvent) => {
  if ((event.currentTarget as HTMLElement).setPointerCapture) (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  emit('resize-start', corner, event)
}
</script>

<template>
  <button v-for="corner in corners" :key="corner" type="button" class="resize-handle" :class="`is-${corner}`" :disabled="disabled" :aria-label="`Resize from ${corner}`" @pointerdown.stop="start(corner, $event)" @pointermove="emit('resize-move', corner, $event)" @pointerup="emit('resize-end', corner, $event)" @pointercancel="emit('resize-end', corner, $event)" />
</template>

<style scoped>
.resize-handle { position: absolute; width: 14px; height: 14px; padding: 0; border: 2px solid var(--color-bg-element); border-radius: 3px; background: var(--color-primary); z-index: 1; }
.is-top-left { top: -7px; left: -7px; cursor: nwse-resize; }
.is-top-right { top: -7px; right: -7px; cursor: nesw-resize; }
.is-bottom-left { bottom: -7px; left: -7px; cursor: nesw-resize; }
.is-bottom-right { right: -7px; bottom: -7px; cursor: nwse-resize; }
</style>
