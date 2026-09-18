<script setup lang="ts">
import type { StyleValue } from 'vue';

defineProps<{
  gridVisible?: boolean;
  gridStyle: StyleValue;
  guides: { type: 'vertical' | 'horizontal'; style: StyleValue }[];
}>();
</script>

<template>
  <div v-if="gridVisible" class="canvas-3x3-grid" :style="gridStyle">
    <div class="grid-line vertical line-1" />
    <div class="grid-line vertical line-2" />
    <div class="grid-line horizontal line-1" />
    <div class="grid-line horizontal line-2" />
  </div>
  <div
    v-for="(guide, index) in guides"
    :key="index"
    class="canvas-guide-line"
    :class="guide.type"
    :style="guide.style"
  />
</template>

<style scoped>
.canvas-3x3-grid {
  position: absolute;
  z-index: 30;
  overflow: hidden;
  border-radius: var(--radius-lg);
  pointer-events: none;
}
.grid-line {
  position: absolute;
  background: rgba(255, 255, 255, 0.45);
}
.grid-line.vertical {
  top: 0;
  bottom: 0;
  width: 1px;
}
.grid-line.vertical.line-1 {
  left: 33.333%;
}
.grid-line.vertical.line-2 {
  left: 66.666%;
}
.grid-line.horizontal {
  right: 0;
  left: 0;
  height: 1px;
}
.grid-line.horizontal.line-1 {
  top: 33.333%;
}
.grid-line.horizontal.line-2 {
  top: 66.666%;
}
.canvas-guide-line {
  position: absolute;
  z-index: 35;
  background: var(--color-primary, #ff5a1f);
  pointer-events: none;
}
.canvas-guide-line.vertical {
  width: 1px;
}
.canvas-guide-line.horizontal {
  height: 1px;
}
</style>
