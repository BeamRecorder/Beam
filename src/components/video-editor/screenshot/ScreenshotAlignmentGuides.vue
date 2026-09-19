<script setup lang="ts">
import type { AlignmentGuide } from '../canvas/composables/canvas-alignment';

defineProps<{ guides: AlignmentGuide[] }>();
const styleFor = (guide: AlignmentGuide) =>
  guide.type === 'vertical' ? { left: `${guide.position * 100}%` } : { top: `${guide.position * 100}%` };
</script>

<template>
  <div
    v-for="(guide, index) in guides"
    :key="`${guide.type}-${guide.position}-${index}`"
    class="screenshot-alignment-guide"
    :class="guide.type"
    :style="styleFor(guide)"
    aria-hidden="true"
  />
</template>

<style scoped>
.screenshot-alignment-guide {
  position: absolute;
  z-index: 1;
  background: var(--color-primary);
  pointer-events: none;
}
.screenshot-alignment-guide.vertical {
  top: 0;
  bottom: 0;
  width: 1px;
}
.screenshot-alignment-guide.horizontal {
  right: 0;
  left: 0;
  height: 1px;
}
</style>
