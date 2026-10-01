<script setup lang="ts">
import { computed, watch, ref, type Component } from 'vue';
import { ImageOff } from '@lucide/vue';
import Skeleton from '~/ui/skeleton/Skeleton.vue';
import { useThumbnails } from '../timeline/waveform/useThumbnails';
import ColorTimelinePreview from '../timeline/ColorTimelinePreview.vue';
import ShapeTimelinePreview from '../timeline/ShapeTimelinePreview.vue';
import LayerThumbnail from '../screenshot/composition/thumbnails/LayerThumbnail.vue';
import type { EditorSearchPreview } from './editor-search-types';
const props = defineProps<{ preview?: EditorSearchPreview; icon?: Component }>();
const asset = computed(() => (props.preview?.kind === 'video' ? props.preview.asset : null));
const source = useThumbnails(asset);
const failed = ref(false);
const loaded = ref(false);
const url = computed(() =>
  props.preview?.kind === 'image'
    ? props.preview.src
    : props.preview?.kind === 'video'
      ? source.thumbnails.value[props.preview.timeSec]
      : undefined,
);
watch(url, () => {
  failed.value = false;
  loaded.value = false;
});
watch(
  () => props.preview,
  (preview) => {
    if (preview?.kind === 'video') source.requestVisibleFrames([preview.timeSec], 240);
  },
  { immediate: true },
);
</script>
<template>
  <ShapeTimelinePreview v-if="preview?.kind === 'shape'" :clip="preview.clip" presentation="thumbnail" />
  <span v-else-if="preview?.kind === 'color'" class="search-thumbnail"
    ><ColorTimelinePreview :clip="preview.clip"
  /></span>
  <LayerThumbnail v-else-if="preview?.kind === 'layer'" :value="preview.value" />
  <span v-else-if="preview" class="search-thumbnail" :aria-busy="!failed && !source.error.value && !loaded">
    <img v-if="url && !failed" :src="url" alt="" draggable="false" @load="loaded = true" @error="failed = true" />
    <ImageOff v-if="failed || source.error.value" :size="16" aria-hidden="true" />
    <Skeleton v-else-if="!loaded" width="100%" height="100%" />
  </span>
  <component :is="icon" v-else-if="icon" :size="18" aria-hidden="true" />
</template>
<style scoped>
.search-thumbnail {
  display: grid;
  place-items: center;
  position: relative;
  width: 38px;
  height: 28px;
  background: var(--color-bg-surface);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
