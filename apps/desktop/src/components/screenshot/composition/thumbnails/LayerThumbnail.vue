<script setup lang="ts">
import { ref, watch } from 'vue';
import { ImageOff } from '@lucide/vue';
import Skeleton from '~/ui/skeleton/Skeleton.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { LayerThumbnail } from './thumbnail-types';
const props = defineProps<{ value?: LayerThumbnail }>();
const { t } = useTranslate('ScreenshotComposition');
const loaded = ref(false);
const failed = ref(false);
watch(
  () => props.value?.revision,
  () => {
    loaded.value = false;
    failed.value = false;
  },
);
</script>
<template>
  <span
    class="layer-thumbnail"
    :aria-busy="!failed && (!value || value.status === 'loading' || (value.status === 'ready' && !loaded))"
  >
    <img
      v-if="value?.status === 'ready'"
      :key="value.revision"
      :src="value.url"
      alt=""
      draggable="false"
      :class="{ loaded }"
      @load="loaded = true"
      @error="failed = true"
    />
    <ImageOff
      v-if="value?.status === 'error' || failed"
      :size="16"
      :aria-label="t('previewError')"
      :title="value?.error || t('previewError')"
    />
    <Transition v-else name="thumbnail-loading">
      <Skeleton
        v-if="!loaded"
        class="thumbnail-skeleton"
        width="100%"
        height="100%"
        :aria-label="t('previewLoading')"
      />
    </Transition>
  </span>
</template>
<style scoped>
.layer-thumbnail {
  width: 30px;
  height: 30px;
  position: relative;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: repeating-conic-gradient(var(--color-bg-element) 0% 25%, var(--color-bg-surface-hover) 0% 50%) 0 0 / 8px
    8px;
}
img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0;
  transform: scale(0.94);
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}
img.loaded {
  opacity: 1;
  transform: scale(1);
}
.thumbnail-skeleton {
  position: absolute;
  inset: 0;
}
.thumbnail-loading-leave-active {
  transition: opacity 160ms ease;
}
.thumbnail-loading-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  img,
  .thumbnail-loading-leave-active {
    transition: none;
  }
}
</style>
