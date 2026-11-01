<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { usePreferredReducedMotion } from '@vueuse/core';
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import Button from '../button/Button.vue';
import ScrollShadow from './ScrollShadow.vue';

const props = defineProps<{ leftLabel: string; rightLabel: string; disabled?: boolean }>();
const scroller = ref<InstanceType<typeof ScrollShadow> | null>(null);
const reduced = usePreferredReducedMotion();
const viewport = computed(() => scroller.value?.viewportRef ?? null);
let frame = 0,
  direction = 0,
  previous = 0;
const stop = () => {
  cancelAnimationFrame(frame);
  frame = 0;
  direction = 0;
};
const move = (amount: number) => {
  const element = viewport.value;
  if (!element || props.disabled) return false;
  const next = Math.max(0, Math.min(element.scrollWidth - element.clientWidth, element.scrollLeft + amount));
  if (next === element.scrollLeft) return false;
  element.scrollLeft = next;
  scroller.value?.updateShadows();
  return true;
};
const tick = (time: number) => {
  const amount = direction * Math.min(48, Math.max(1, time - previous)) * 0.32;
  previous = time;
  if (move(amount)) frame = requestAnimationFrame(tick);
  else stop();
};
const start = (value: number) => {
  stop();
  if (props.disabled || reduced.value === 'reduce') return;
  direction = value;
  previous = performance.now();
  frame = requestAnimationFrame(tick);
};
const step = (value: number) => {
  move(value * Math.max(80, (viewport.value?.clientWidth ?? 0) * 0.7));
};
const revealEnd = () => {
  if (viewport.value) move(viewport.value.scrollWidth);
};
watch(
  () => props.disabled,
  (value) => {
    if (value) stop();
  },
);
watch(reduced, (value) => {
  if (value === 'reduce') stop();
});
const visibility = () => {
  if (document.hidden) stop();
};
onMounted(() => {
  window.addEventListener('blur', stop);
  document.addEventListener('visibilitychange', visibility);
});
onBeforeUnmount(() => {
  stop();
  window.removeEventListener('blur', stop);
  document.removeEventListener('visibilitychange', visibility);
});
defineExpose({ revealEnd });
</script>

<template>
  <div class="arrow-scroll" @mouseleave="stop">
    <Button
      v-if="scroller?.hasLeftShadow"
      variant="ghost"
      size="xs"
      icon-only
      :icon="ChevronLeft"
      :aria-label="leftLabel"
      :disabled="disabled"
      @mouseenter="start(-1)"
      @mouseleave="stop"
      @click="step(-1)"
    />
    <ScrollShadow ref="scroller" class="arrow-scroll-content" orientation="horizontal" hide-scrollbar :size="12"
      ><slot
    /></ScrollShadow>
    <Button
      v-if="scroller?.hasRightShadow"
      variant="ghost"
      size="xs"
      icon-only
      :icon="ChevronRight"
      :aria-label="rightLabel"
      :disabled="disabled"
      @mouseenter="start(1)"
      @mouseleave="stop"
      @click="step(1)"
    />
  </div>
</template>

<style scoped>
.arrow-scroll {
  display: flex;
  align-items: center;
  min-width: 0;
}
.arrow-scroll-content {
  flex: 1;
  min-width: 0;
}
</style>
