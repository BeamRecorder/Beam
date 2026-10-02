<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { createRafReveal } from './raf-reveal';
defineProps<{ mode?: 'out-in' | 'in-out' | 'default' }>();
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const transition = createRafReveal({
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
  now: () => performance.now(),
  reducedMotion: () => motion.matches,
});
onBeforeUnmount(transition.dispose);
</script>
<template>
  <Transition
    :css="false"
    :mode="mode"
    @enter="transition.enter"
    @leave="transition.leave"
    @after-leave="transition.afterLeave"
    @enter-cancelled="transition.cancel"
    @leave-cancelled="transition.cancel"
    ><slot
  /></Transition>
</template>
