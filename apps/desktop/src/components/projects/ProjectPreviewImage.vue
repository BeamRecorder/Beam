<script setup lang="ts">
import { ref, watch } from 'vue';
import Skeleton from '~/ui/skeleton/Skeleton.vue';

const props = defineProps<{ src?: string | null; alt: string }>();
const loading = ref(true);
watch(
  () => props.src,
  () => {
    loading.value = true;
  },
);
</script>

<template>
  <Skeleton v-if="!src || loading" class="preview-skeleton" variant="linear" height="100%" width="100%" />
  <img
    v-if="src"
    :key="src"
    :src="src"
    :alt="alt"
    class="preview-image"
    :class="{ 'is-ready': !loading }"
    decoding="async"
    @load="loading = false"
    @error="loading = false"
  />
</template>

<style scoped>
.preview-skeleton,
.preview-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
}
.preview-image {
  object-fit: cover;
  opacity: 0;
  transform: translateY(4px);
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}
.preview-image.is-ready {
  opacity: 1;
  transform: translateY(0);
}
@media (prefers-reduced-motion: reduce) {
  .preview-image {
    transition: none;
    transform: none;
  }
}
</style>
