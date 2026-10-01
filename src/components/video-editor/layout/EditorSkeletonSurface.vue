<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import Skeleton from '~/ui/skeleton/Skeleton.vue';
import { editorSkeletonShapes } from './editor-skeleton-shapes';
import type { EditorSkeletonShape } from './editor-skeleton-types';

const source = ref<HTMLElement | null>(null);
const shapes = ref<EditorSkeletonShape[]>([]);
let frame: number | undefined;
let disposed = false;
let resize: ResizeObserver;
let mutation: MutationObserver;
const measure = () => {
  frame = undefined;
  if (source.value) shapes.value = editorSkeletonShapes(source.value);
};
const schedule = () => {
  if (!disposed && frame === undefined) frame = requestAnimationFrame(measure);
};
onMounted(() => {
  measure();
  resize = new ResizeObserver(schedule);
  mutation = new MutationObserver(schedule);
  resize.observe(source.value!);
  mutation.observe(source.value!, { childList: true, subtree: true, attributes: true, characterData: true });
});
onBeforeUnmount(() => {
  disposed = true;
  resize.disconnect();
  mutation.disconnect();
  if (frame !== undefined) cancelAnimationFrame(frame);
});
</script>

<template>
  <div class="editor-skeleton-surface" aria-hidden="true" inert>
    <div ref="source" class="skeleton-source"><slot /></div>
    <Skeleton
      v-for="shape in shapes"
      :key="shape.id"
      class="skeleton-shape"
      variant="animated-gradient"
      :width="`${shape.width}px`"
      :height="`${shape.height}px`"
      :radius="shape.radius"
      :style="{ left: `${shape.left}px`, top: `${shape.top}px` }"
    />
  </div>
</template>

<style scoped>
.editor-skeleton-surface {
  position: relative;
}
.skeleton-source {
  visibility: hidden;
}
.skeleton-shape {
  position: absolute;
  pointer-events: none;
}
</style>
