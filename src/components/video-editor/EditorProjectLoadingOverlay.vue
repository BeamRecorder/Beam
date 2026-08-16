<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useMotion, type Variant } from '@vueuse/motion';
import Skeleton from '~/ui/skeleton/Skeleton.vue';

const props = defineProps<{
  visible: boolean;
  label: string;
  showTopbarSkeleton?: boolean;
  timelineHeight?: number;
}>();

const displayOverlay = ref(props.visible);
const motionTarget = ref<HTMLElement | null>(null);
let transitionGeneration = 0;
let visibleSince = props.visible ? Date.now() : 0;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
const MINIMUM_VISIBLE_MS = 300;

const variants = {
  initial: { opacity: 0 },
  enter: { opacity: 1, transition: { type: 'tween', duration: 210, ease: [0.22, 1, 0.36, 1] } },
  leave: {
    opacity: 0,
    transition: { type: 'tween', duration: 320, ease: [0.4, 0, 0.2, 1] },
  },
} satisfies Record<'initial' | 'enter' | 'leave', Variant>;

const motion = useMotion(motionTarget, {}, { lifeCycleHooks: false, syncVariants: false });

async function show(generation: number) {
  await nextTick();
  if (generation !== transitionGeneration || !motionTarget.value) return;
  motion.set(variants.initial);
  await motion.apply(variants.enter);
}

async function hide(generation: number) {
  if (generation !== transitionGeneration || !motionTarget.value) return;
  await motion.apply(variants.leave);
  if (generation === transitionGeneration) displayOverlay.value = false;
}

watch(
  () => props.visible,
  (visible) => {
    const generation = visible ? ++transitionGeneration : transitionGeneration;
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (visible) {
      visibleSince = Date.now();
      displayOverlay.value = true;
      void show(generation);
    } else if (displayOverlay.value) {
      const remainingMs = Math.max(0, MINIMUM_VISIBLE_MS - (Date.now() - visibleSince));
      hideTimer = setTimeout(() => {
        hideTimer = null;
        void hide(generation);
      }, remainingMs);
    }
  },
);

onMounted(() => {
  if (displayOverlay.value) void show(transitionGeneration);
});

onUnmounted(() => {
  if (hideTimer) clearTimeout(hideTimer);
  motion.stop();
});
</script>

<template>
  <div
    v-if="displayOverlay"
    ref="motionTarget"
    class="editor-project-loading-overlay"
    :aria-label="label"
    aria-live="polite"
    role="status"
  >
    <Skeleton
      v-if="showTopbarSkeleton"
      class="loading-titlebar"
      variant="animated-gradient"
      width="100%"
      height="40px"
      radius="0"
      aria-hidden="true"
    />
    <div v-else class="loading-titlebar loading-titlebar-spacer" aria-hidden="true"></div>
    <div class="loading-workspace" aria-hidden="true">
      <div class="loading-upper">
        <div class="loading-sidebar-space" />
        <div class="loading-properties-space" />
        <div class="loading-canvas-column">
          <div class="loading-canvas-toolbar">
            <Skeleton variant="animated-gradient" width="280px" height="28px" radius="var(--radius-md)" />
          </div>
          <div class="loading-canvas-stage">
            <Skeleton
              class="loading-canvas-frame"
              variant="animated-gradient"
              width="100%"
              height="100%"
              radius="var(--radius-lg)"
            />
          </div>
          <div class="loading-timeline-toolbar">
            <Skeleton
              variant="animated-gradient"
              width="min(560px, calc(100% - 32px))"
              height="36px"
              radius="var(--radius-md)"
            />
          </div>
        </div>
      </div>
      <div class="loading-timeline-resize-space" />
      <div class="loading-timeline" :style="{ height: `${timelineHeight ?? 210}px` }">
        <Skeleton variant="animated-gradient" width="100%" height="100%" radius="inherit" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-project-loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 1900;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
  pointer-events: auto;
  opacity: 0;
  will-change: opacity;
}

.loading-titlebar {
  flex: none;
}

.loading-titlebar-spacer {
  height: 40px;
  pointer-events: none;
}

.loading-workspace {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

.loading-upper {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 12px;
  overflow: hidden;
}

.loading-timeline {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  box-sizing: border-box;
}

.loading-sidebar-space,
.loading-properties-space {
  flex: none;
}

.loading-sidebar-space {
  width: 92px;
}

.loading-properties-space {
  width: 400px;
}

.loading-canvas-column {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
}

.loading-canvas-toolbar,
.loading-timeline-toolbar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
}

.loading-canvas-toolbar {
  height: 44px;
}

.loading-timeline-toolbar {
  height: 48px;
}

.loading-timeline-resize-space {
  flex: none;
  height: 12px;
  margin-block: -6px;
}

.loading-canvas-stage {
  container-type: size;
  position: relative;
  flex: 1;
  min-height: 0;
}

.loading-canvas-frame {
  position: absolute;
  inset: 0;
  width: min(100cqw, calc(100cqh * 1.7778)) !important;
  height: min(100cqh, calc(100cqw / 1.7778)) !important;
  margin: auto;
}

.loading-timeline {
  flex: none;
}
</style>
