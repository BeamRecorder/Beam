<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { capture } from '~/api/capture';
import { useTranslate } from '~/i18n/useTranslate';
const { t } = useTranslate('Teleprompter');
const emit = defineEmits<{ error: [message: string] }>();
let start: { x: number; y: number; width: number; height: number; pointerId: number } | null = null;
let size = { width: 0, height: 0 };
let frame: number | null = null;
let disposed = false;
const begin = (event: PointerEvent) => {
  if (event.button !== 0 || start) return;
  start = { x: event.screenX, y: event.screenY, width: innerWidth, height: innerHeight, pointerId: event.pointerId };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
};
const flush = () => {
  frame = null;
  void capture.resizeTeleprompter({ ...size }).catch((reason) => {
    if (!disposed) emit('error', String(reason));
  });
};
const schedule = (width: number, height: number) => {
  size = { width: Math.max(240, width), height: Math.max(140, height) };
  if (frame === null) frame = requestAnimationFrame(flush);
};
const move = (event: PointerEvent) => {
  if (!start || event.pointerId !== start.pointerId) return;
  schedule(start.width + event.screenX - start.x, start.height + event.screenY - start.y);
};
const end = (event: PointerEvent) => {
  if (!start || event.pointerId !== start.pointerId) return;
  start = null;
  if (frame !== null) {
    cancelAnimationFrame(frame);
    flush();
  }
};
const cancel = () => {
  start = null;
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
};
const key = (event: KeyboardEvent) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const step = event.shiftKey ? 32 : 8;
  const width = innerWidth + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0);
  const height = innerHeight + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0);
  schedule(width, height);
};
onBeforeUnmount(() => {
  disposed = true;
  cancel();
});
</script>
<template>
  <button
    type="button"
    class="teleprompter-resize"
    :aria-label="t('resize')"
    @pointerdown.prevent="begin"
    @pointermove="move"
    @pointerup="end"
    @pointercancel="cancel"
    @lostpointercapture="cancel"
    @keydown="key"
  />
</template>
<style scoped>
.teleprompter-resize {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: nwse-resize;
  touch-action: none;
  -webkit-app-region: no-drag;
}
.teleprompter-resize:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: -2px;
}
.teleprompter-resize::after {
  content: '';
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 5px;
  height: 5px;
  border-right: 1px solid var(--color-border-strong);
  border-bottom: 1px solid var(--color-border-strong);
}
</style>
