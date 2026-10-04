<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useResizeObserver } from '@vueuse/core';
import ScrollShadow from '~/ui/scroll-shadow/ScrollShadow.vue';
const props = defineProps<{ text: string }>();
const shadow = ref<InstanceType<typeof ScrollShadow> | null>(null);
const label = ref<HTMLElement | null>(null);
const distance = ref(0);
const viewport = computed(() => shadow.value?.viewportRef);
const measure = () => {
  distance.value =
    label.value && viewport.value ? Math.max(0, label.value.scrollWidth - viewport.value.clientWidth) : 0;
  shadow.value?.updateShadows();
};
useResizeObserver([viewport, label], measure);
onMounted(measure);
watch(
  () => props.text,
  () => nextTick(measure),
);
const motion = computed(() => ({
  '--label-travel': `${distance.value}px`,
  '--label-duration': `${Math.max(3, distance.value / 30)}s`,
}));
</script>
<template>
  <ScrollShadow
    ref="shadow"
    as="span"
    class="composition-label"
    :class="{ overflowing: distance > 1 }"
    :style="motion"
    orientation="horizontal"
    :size="12"
    hide-scrollbar
    :scrollable="false"
    :title="text"
  >
    <span ref="label" class="label-text">{{ text }}</span>
  </ScrollShadow>
</template>
<style scoped>
.composition-label {
  flex: 1;
  min-width: 0;
  text-align: left;
  white-space: nowrap;
}
.label-text {
  flex: 0 0 auto;
  width: max-content;
}
@media (prefers-reduced-motion: no-preference) {
  .composition-label.overflowing:hover .label-text,
  :global(button:focus-visible) .composition-label.overflowing .label-text {
    animation: composition-label-marquee var(--label-duration) 350ms ease-in-out infinite alternate;
  }
}
@keyframes composition-label-marquee {
  0%,
  12% {
    transform: translateX(0);
  }
  88%,
  100% {
    transform: translateX(calc(-1 * var(--label-travel)));
  }
}
</style>
