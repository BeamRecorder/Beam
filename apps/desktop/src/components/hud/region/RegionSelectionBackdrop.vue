<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { capture } from '../../../api/capture';

const props = defineProps<{ image: string; previewId: number }>();
let frame = 0;
let reported = false;
const report = (success: boolean) => {
  if (reported) return;
  reported = true;
  cancelAnimationFrame(frame);
  capture.notifyScreenRegionPreviewReady(props.previewId, success);
};
const loaded = () => {
  if (reported) return;
  cancelAnimationFrame(frame);
  // Keep the native selector hidden until the decoded image has painted.
  frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => report(true));
  });
};
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>

<template>
  <img class="region-desktop-preview" :src="image" alt="" draggable="false" @load="loaded" @error="report(false)" />
</template>

<style scoped>
.region-desktop-preview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
}
</style>
