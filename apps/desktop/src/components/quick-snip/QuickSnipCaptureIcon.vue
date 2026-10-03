<script setup lang="ts">
import { Circle } from '@lucide/vue';
import CaptureModeIcon from '../capture/CaptureModeIcon.vue';
defineProps<{ screenshot: boolean }>();
</script>
<template>
  <span class="capture-symbol" aria-hidden="true">
    <Transition name="capture-symbol" mode="out-in">
      <span :key="screenshot ? 'image' : 'video'" class="capture-symbol-artwork">
        <CaptureModeIcon v-if="screenshot" mode="screenshot" :size="18" decorative />
        <Circle v-else :size="18" fill="currentColor" :stroke-width="0" />
      </span>
    </Transition>
  </span>
</template>
<style scoped>
.capture-symbol,
.capture-symbol-artwork {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
}
.capture-symbol-enter-active,
.capture-symbol-leave-active {
  transition:
    opacity 90ms ease,
    transform 90ms ease;
}
.capture-symbol-enter-from,
.capture-symbol-leave-to {
  opacity: 0;
  transform: scale(0.65);
}
@media (prefers-reduced-motion: reduce) {
  .capture-symbol-enter-active,
  .capture-symbol-leave-active {
    transition: none;
  }
}
</style>
