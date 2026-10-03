<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import EditorTitlebar from './EditorTitlebar.vue';
import EditorLoadingLayout from './layout/EditorLoadingLayout.vue';
import Skeleton from '~/ui/skeleton/Skeleton.vue';
import type { EditorProjectLoadingProps } from './layout/editor-layout-types';

const props = withDefaults(defineProps<EditorProjectLoadingProps>(), { kind: 'video' });
const displayOverlay = ref(props.visible);
const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
let exitTimer: ReturnType<typeof setTimeout> | undefined;
const cancelExit = () => clearTimeout(exitTimer);
watch(
  () => props.visible,
  (visible) => {
    cancelExit();
    if (visible) displayOverlay.value = true;
    else if (reducedMotion.value) displayOverlay.value = false;
    else
      exitTimer = setTimeout(() => {
        displayOverlay.value = false;
      }, 160);
  },
);
onBeforeUnmount(cancelExit);
</script>

<template>
  <div
    v-if="displayOverlay"
    class="editor-project-loading-overlay"
    :class="{ 'is-leaving': !visible }"
    :aria-label="label"
    aria-live="polite"
    role="status"
  >
    <EditorTitlebar v-if="showTopbarSkeleton" class="loading-titlebar" aria-hidden="true">
      <template #left>
        <Skeleton width="84px" height="28px" />
        <Skeleton width="92px" height="28px" />
        <Skeleton v-if="kind === 'video'" width="64px" height="28px" />
        <Skeleton width="28px" height="28px" />
      </template>
      <template #center><Skeleton width="100%" height="32px" /></template>
      <template #right>
        <Skeleton v-if="kind === 'screenshot'" width="136px" height="28px" />
        <Skeleton width="80px" height="28px" />
        <Skeleton width="96px" height="28px" />
      </template>
    </EditorTitlebar>
    <div v-else class="loading-titlebar-spacer" aria-hidden="true" />
    <EditorLoadingLayout :kind="kind" :timeline-height="timelineHeight" :aspect-ratio="aspectRatio" />
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
  pointer-events: auto;
  opacity: 1;
  transition: opacity 160ms ease-out;
}
.is-leaving {
  opacity: 0;
  pointer-events: none;
}
.loading-titlebar-spacer {
  flex: none;
  height: var(--editor-titlebar-height);
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .editor-project-loading-overlay {
    transition: none;
  }
}
</style>
