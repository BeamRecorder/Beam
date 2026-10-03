<script setup lang="ts">
import { computed } from 'vue';
import { magnifierPosition } from './region-overlay-layout';
import type { RegionPointer, RegionViewport } from './region-overlay-types';
const props = defineProps<{
  image: string;
  pointer: RegionPointer;
  viewport: RegionViewport;
}>();
const SIZE = 144;
const ZOOM = 3;
const position = computed(() => magnifierPosition(props.pointer, props.viewport, SIZE));
const imageStyle = computed(() => ({
  width: `${props.viewport.width * ZOOM}px`,
  height: `${props.viewport.height * ZOOM}px`,
  transform: `translate(${SIZE / 2 - props.pointer.x * ZOOM}px, ${SIZE / 2 - props.pointer.y * ZOOM}px)`,
}));
</script>
<template>
  <div class="region-magnifier" :style="position" aria-hidden="true">
    <img :src="image" alt="" :style="imageStyle" draggable="false" />
    <span class="crosshair horizontal" /><span class="crosshair vertical" />
    <span class="center" />
  </div>
</template>
<style scoped>
.region-magnifier {
  position: fixed;
  z-index: 10;
  width: 144px;
  height: 144px;
  overflow: hidden;
  pointer-events: none;
  border: 2px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-lg);
}
.region-magnifier img {
  position: absolute;
  max-width: none;
  image-rendering: pixelated;
}
.crosshair {
  position: absolute;
  background: var(--color-primary);
  opacity: 0.65;
}
.horizontal {
  top: 50%;
  left: 0;
  width: 100%;
  height: 1px;
}
.vertical {
  left: 50%;
  top: 0;
  height: 100%;
  width: 1px;
}
.center {
  position: absolute;
  top: calc(50% - 3px);
  left: calc(50% - 3px);
  width: 6px;
  height: 6px;
  border: 1px solid var(--text-light);
  outline: 1px solid var(--color-primary);
}
</style>
