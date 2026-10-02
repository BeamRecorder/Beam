<script setup lang="ts">
import { inject, type ComponentPublicInstance } from 'vue';
import { TIMELINE_SURFACE_KEY } from './timeline-surface-types';

const surface = inject(TIMELINE_SURFACE_KEY);
if (!surface) throw new Error('Timeline canvas requires the shared surface.');
const setCanvas = (element: Element | ComponentPublicInstance | null) => {
  surface.canvas.value = element instanceof HTMLCanvasElement ? element : null;
};
</script>
<template>
  <div class="timeline-surface-frame" aria-hidden="true">
    <canvas :ref="setCanvas" class="timeline-content-surface" />
  </div>
</template>
<style scoped>
.timeline-surface-frame {
  position: sticky;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  flex: none;
  pointer-events: none;
  z-index: 1;
}
.timeline-content-surface {
  position: absolute;
  left: 0;
  top: 0;
  transform: translate3d(0, 0, 0);
  will-change: transform;
}
</style>
