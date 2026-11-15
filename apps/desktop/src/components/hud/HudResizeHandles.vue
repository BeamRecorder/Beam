<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { capture } from '~/api/capture';
import type { HudResizePhase, HudSize } from '~/api/types/hud-resize-types';

const emit = defineEmits<{ resize: [size: HudSize] }>();
const edges = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
let pointer: number | null = null;
let handle: HTMLElement | null = null;
let pending = Promise.resolve();
let frame = 0;
let disposed = false;
const request = (edge: string | null, phase: HudResizePhase) => {
  pending = pending
    .then(async () => {
      const size = await capture.resizeHud(edge, phase);
      if (size && !disposed) emit('resize', size);
    })
    .catch((error: unknown) => console.error('HUD resizing failed:', error));
};
const start = (event: PointerEvent, edge: string) => {
  if (event.button !== 0 || pointer !== null) return;
  event.preventDefault();
  handle = event.currentTarget as HTMLElement;
  pointer = event.pointerId;
  handle.dataset.resizing = 'true';
  capture.setInteractive(true);
  handle.setPointerCapture(pointer);
  request(edge, 'start');
};
const move = (event: PointerEvent) => {
  if (event.pointerId !== pointer || frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    request(null, 'move');
  });
};
const end = () => {
  if (pointer === null) return;
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  request(null, 'move');
  request(null, 'end');
  const previous = pointer;
  pointer = null;
  if (handle) delete handle.dataset.resizing;
  if (handle?.hasPointerCapture(previous)) handle.releasePointerCapture(previous);
  handle = null;
};
onMounted(() => {
  request(null, 'read');
  window.addEventListener('blur', end);
});
onBeforeUnmount(() => {
  disposed = true;
  end();
  window.removeEventListener('blur', end);
});
</script>

<template>
  <div
    v-for="edge in edges"
    :key="edge"
    aria-hidden="true"
    class="hud-resize-edge"
    :class="edge"
    @pointerdown="start($event, edge)"
    @pointermove="move"
    @pointerup="end"
    @pointercancel="end"
    @lostpointercapture="end"
  />
</template>

<style scoped>
.hud-resize-edge {
  position: absolute;
  z-index: 10;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  app-region: no-drag;
}
.n,
.s {
  left: 12px;
  right: 12px;
  height: 6px;
  cursor: ns-resize;
}
.n {
  top: -3px;
}
.s {
  bottom: -3px;
}
.e,
.w {
  top: 12px;
  bottom: 12px;
  width: 6px;
  cursor: ew-resize;
}
.e {
  right: -3px;
}
.w {
  left: -3px;
}
.ne,
.nw,
.se,
.sw {
  width: 12px;
  height: 12px;
}
.ne,
.nw {
  top: -3px;
}
.se,
.sw {
  bottom: -3px;
}
.ne,
.se {
  right: -3px;
}
.nw,
.sw {
  left: -3px;
}
.ne,
.sw {
  cursor: nesw-resize;
}
.nw,
.se {
  cursor: nwse-resize;
}
</style>
