<script setup lang="ts">
import Skeleton from '~/ui/skeleton/Skeleton.vue';
import type { EditorLoadingFrameProps } from './editor-layout-types';
defineProps<EditorLoadingFrameProps>();
</script>

<template>
  <Skeleton
    v-if="aspectRatio"
    class="loading-canvas-frame"
    variant="animated-gradient"
    width="min(100cqw, calc(100cqh * var(--loading-aspect-ratio)))"
    height="min(100cqh, calc(100cqw / var(--loading-aspect-ratio)))"
    radius="var(--radius-lg)"
    :style="{ '--loading-aspect-ratio': aspectRatio }"
  />
</template>

<style scoped>
.loading-canvas-frame {
  position: absolute;
  inset: 0;
  margin: auto;
}
.canvas-frame-ready-leave-active {
  transition: opacity 160ms ease-out;
  pointer-events: none;
}
.canvas-frame-ready-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .canvas-frame-ready-leave-active {
    transition: none;
  }
}
</style>
