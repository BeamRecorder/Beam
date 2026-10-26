<script setup lang="ts">
import { computed, onMounted, onUpdated, ref } from 'vue';
import { useElementHover, useFocusWithin, usePreferredReducedMotion, useResizeObserver } from '@vueuse/core';
import { useScrollShadow } from '../scroll-shadow/useScrollShadow';

const props = withDefaults(
  defineProps<{
    trigger?: HTMLElement | null;
    disabled?: boolean;
    align?: 'center' | 'start';
    labelClass?: string;
  }>(),
  { align: 'start' },
);
const viewport = ref<HTMLElement | null>(null);
const label = ref<HTMLElement | null>(null);
const distance = ref(0);
const trigger = computed(() => props.trigger ?? viewport.value);
const hovered = useElementHover(trigger);
const { focused } = useFocusWithin(trigger);
const reducedMotion = usePreferredReducedMotion();
const active = computed(() => !props.disabled && (hovered.value || focused.value) && reducedMotion.value !== 'reduce');
const { hasLeftShadow, hasRightShadow, updateShadows } = useScrollShadow(viewport, {
  orientation: 'horizontal',
  offset: 1,
});
const measure = () => {
  distance.value =
    viewport.value && label.value ? Math.max(0, label.value.scrollWidth - viewport.value.clientWidth) : 0;
  updateShadows();
};
useResizeObserver([viewport, label], measure);
onMounted(measure);
onUpdated(measure);
const style = computed(() => ({
  '--marquee-distance': `${distance.value}px`,
  '--marquee-duration': `${Math.max(1.4, distance.value / 28)}s`,
  maskImage: hasLeftShadow.value
    ? hasRightShadow.value
      ? 'var(--marquee-both-edges)'
      : 'var(--marquee-left-edge)'
    : hasRightShadow.value
      ? 'var(--marquee-right-edge)'
      : undefined,
}));
</script>
<template>
  <span
    ref="viewport"
    class="marquee-text"
    :class="{ 'is-overflowing': distance > 1, 'is-active': active, centered: align === 'center' }"
    :style="style"
  >
    <span ref="label" class="marquee-label" :class="labelClass"><slot /></span>
  </span>
</template>
<style scoped>
.marquee-text {
  --marquee-right-edge: linear-gradient(to right, black calc(100% - 12px), transparent);
  --marquee-left-edge: linear-gradient(to right, transparent, black 12px);
  --marquee-both-edges: linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent);
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  scrollbar-width: none;
}
.marquee-text::-webkit-scrollbar {
  display: none;
}
.marquee-label {
  display: inline-block;
  width: max-content;
  min-width: 100%;
  max-width: none;
  vertical-align: top;
  text-align: start;
}
.centered .marquee-label {
  text-align: center;
}
@media (prefers-reduced-motion: no-preference) {
  .is-overflowing.is-active {
    animation: marquee-edges var(--marquee-duration) 0.4s ease-in-out infinite alternate;
  }
  .is-overflowing.is-active .marquee-label {
    animation: marquee-travel var(--marquee-duration) 0.4s ease-in-out infinite alternate;
  }
}
@media (prefers-reduced-motion: reduce) {
  .marquee-text {
    overflow-x: auto;
  }
}
@keyframes marquee-travel {
  0%,
  12% {
    transform: translateX(0);
  }
  88%,
  100% {
    transform: translateX(calc(-1 * var(--marquee-distance)));
  }
}
@keyframes marquee-edges {
  0%,
  12% {
    mask-image: var(--marquee-right-edge);
  }
  13%,
  87% {
    mask-image: var(--marquee-both-edges);
  }
  88%,
  100% {
    mask-image: var(--marquee-left-edge);
  }
}
</style>
