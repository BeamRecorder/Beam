<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue';
import { Camera, Captions, Film, Image, Layers, Monitor, Palette, Shapes, Volume2 } from '@lucide/vue';
import type { Clip, ClipKind, MediaAsset } from '~/media/shared/composition-types';

const props = defineProps<{
  clip: Clip;
  asset?: MediaAsset | null;
  posterUrl?: string;
  requestPoster: (clip: Clip, asset?: MediaAsset | null) => void;
}>();
const icons: Record<ClipKind, Component> = {
  screen: Monitor,
  video: Film,
  image: Image,
  webcam: Camera,
  color: Palette,
  shape: Shapes,
  blur: Layers,
  audio: Volume2,
  caption: Captions,
};
const root = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;
let visible = false;
const requestIfVisible = () => {
  if (visible) props.requestPoster(props.clip, props.asset);
};
onMounted(() => {
  if (!root.value || typeof IntersectionObserver === 'undefined') {
    visible = true;
    requestIfVisible();
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      visible = true;
      requestIfVisible();
      observer?.disconnect();
      observer = null;
    },
    { root: root.value.closest('.linked-clip-list'), rootMargin: '48px' },
  );
  observer.observe(root.value);
});
watch(() => [props.clip.id, props.clip.sourceInMs, props.asset?.src], requestIfVisible);
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <span
    ref="root"
    class="clip-thumbnail"
    :class="{ 'has-poster': Boolean(posterUrl || (clip.kind === 'image' && asset?.kind === 'image')) }"
    aria-hidden="true"
  >
    <img v-if="clip.kind === 'image' && asset?.kind === 'image'" class="thumbnail-image" :src="asset.src" alt="" />
    <img v-else-if="posterUrl" class="thumbnail-image" :src="posterUrl" alt="" />
    <span class="thumbnail-icon"><component :is="icons[clip.kind]" :size="15" /></span>
  </span>
</template>

<style scoped>
.clip-thumbnail {
  position: relative;
  display: grid;
  place-items: center;
  width: 56px;
  height: 42px;
  flex: 0 0 56px;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--color-primary-light);
  color: var(--color-primary);
}
.thumbnail-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumbnail-icon {
  position: absolute;
  right: 3px;
  bottom: 3px;
  display: grid;
  place-items: center;
  width: 21px;
  height: 21px;
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--color-bg-element) 78%, transparent);
  color: var(--color-primary);
}
.clip-thumbnail:not(.has-poster) .thumbnail-icon {
  right: auto;
  bottom: auto;
  width: 28px;
  height: 28px;
}
</style>
