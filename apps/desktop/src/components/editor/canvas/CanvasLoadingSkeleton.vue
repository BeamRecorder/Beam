<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type CSSProperties } from 'vue';
import { useMotion, type Variant } from '@vueuse/motion';
import Skeleton from '../../ui/skeleton/Skeleton.vue';

const props = defineProps<{
  visible: boolean;
  label: string;
  aspectRatio: number;
}>();
const emit = defineEmits<{
  reveal: [];
}>();

const displaySkeleton = ref(props.visible);
const motionTarget = ref<HTMLElement | null>(null);
let transitionGeneration = 0;

const motionVariants = {
  initial: { opacity: 1 },
  enter: {
    opacity: 1,
    transition: { immediate: true },
  },
  leave: {
    opacity: 0,
    transition: { type: 'tween', duration: 650, ease: [0.4, 0, 0.2, 1] },
  },
} satisfies Record<'initial' | 'enter' | 'leave', Variant>;

const motion = useMotion(motionTarget, {}, { lifeCycleHooks: false, syncVariants: false });
const layoutStyle = computed(
  () =>
    ({
      '--loading-aspect-ratio': Math.max(0.01, props.aspectRatio),
    }) as CSSProperties,
);

async function animateIn(generation: number) {
  await nextTick();
  if (generation !== transitionGeneration || !motionTarget.value) return;
  motion.set(motionVariants.initial);
  await motion.apply(motionVariants.enter);
}

async function animateOut(generation: number) {
  if (generation !== transitionGeneration || !motionTarget.value) return;
  emit('reveal');
  await motion.apply(motionVariants.leave);
  if (generation === transitionGeneration) displaySkeleton.value = false;
}

watch(
  () => props.visible,
  (visible) => {
    const generation = visible ? ++transitionGeneration : transitionGeneration;
    if (visible) {
      displaySkeleton.value = true;
      void animateIn(generation);
      return;
    }

    if (!displaySkeleton.value) {
      emit('reveal');
      return;
    }
    void animateOut(generation);
  },
);

onMounted(() => {
  if (displaySkeleton.value) void animateIn(transitionGeneration);
});

onUnmounted(() => {
  motion.stop();
});
</script>

<template>
  <div
    v-if="displaySkeleton"
    ref="motionTarget"
    class="canvas-loading-skeleton"
    :style="layoutStyle"
    :aria-label="label"
    aria-live="polite"
    data-slot="canvas-loading-skeleton"
    role="status"
  >
    <Skeleton variant="animated-gradient" width="100%" height="100%" radius="var(--radius-lg)" />
  </div>
</template>

<style scoped>
.canvas-loading-skeleton {
  position: absolute;
  inset: 0;
  z-index: 3;
  width: min(100cqw, calc(100cqh * var(--loading-aspect-ratio)));
  height: min(100cqh, calc(100cqw / var(--loading-aspect-ratio)));
  margin: auto;
  overflow: hidden;
  pointer-events: none;
  opacity: 1;
  will-change: opacity;
}
</style>
