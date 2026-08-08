<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from 'vue';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import type { BackgroundValue } from './composables/backgroundCatalog';

const props = defineProps<{
  background: BackgroundValue | null;
}>();

const mediaFailed = ref(false);

const resolvedMediaPath = computed(() => {
  const background = props.background;
  return background && (background.kind === 'image' || background.kind === 'video')
    ? resolvePublicAssetUrl(background.path)
    : '';
});

const surfaceStyle = computed<CSSProperties>(() => {
  const background = props.background;
  if (!background || background.kind === 'image' || background.kind === 'video') return {};
  if (background.kind === 'color') return { background: background.color };

  const stops = background.gradient.stops
    .map((stop) => {
      const alpha = Math.round(Math.max(0, Math.min(1, stop.alpha)) * 255)
        .toString(16)
        .padStart(2, '0');
      return `${stop.color}${alpha} ${Math.round(stop.position * 100)}%`;
    })
    .join(', ');
  return {
    background:
      background.gradient.type === 'radial'
        ? `radial-gradient(circle, ${stops})`
        : `linear-gradient(${background.gradient.angle}deg, ${stops})`,
  };
});

watch(
  () => props.background?.id,
  () => {
    mediaFailed.value = false;
  },
);
</script>

<template>
  <div class="editor-ambient-background" aria-hidden="true">
    <div
      v-if="background && (background.kind === 'color' || background.kind === 'gradient')"
      class="ambient-surface"
      :style="surfaceStyle"
    ></div>
    <img
      v-else-if="background?.kind === 'image' && !mediaFailed"
      class="ambient-media"
      :src="resolvedMediaPath"
      alt=""
      aria-hidden="true"
      decoding="async"
      fetchpriority="low"
      @error="mediaFailed = true"
    />
    <video
      v-else-if="background?.kind === 'video' && !mediaFailed"
      class="ambient-media ambient-video"
      :src="resolvedMediaPath"
      muted
      playsinline
      preload="auto"
      aria-hidden="true"
      @error="mediaFailed = true"
    ></video>
    <div class="ambient-veil"></div>
  </div>
</template>

<style scoped>
.editor-ambient-background {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
  background: var(--color-bg-surface);
}

.ambient-media,
.ambient-surface {
  position: absolute;
  inset: -64px;
  width: calc(100% + 128px);
  height: calc(100% + 128px);
  opacity: var(--editor-ambient-media-opacity);
  filter: blur(56px) saturate(0.9) contrast(0.92);
  transform: scale(1.06);
}

.ambient-media {
  object-fit: cover;
}

.ambient-veil {
  position: absolute;
  inset: 0;
  background: var(--color-bg-surface);
  opacity: var(--editor-ambient-veil-opacity);
}

@media (prefers-reduced-transparency: reduce) {
  .ambient-media,
  .ambient-surface {
    display: none;
  }

  .ambient-veil {
    opacity: 1;
  }
}
</style>
