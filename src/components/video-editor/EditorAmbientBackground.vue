<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch, type CSSProperties } from 'vue';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import type { BackgroundValue } from './composables/backgroundCatalog';
import { decodeVideoPoster } from '~/media/playback';
import { mediaSourceDescriptor, type MediaFrame } from '~/media/shared';
import type { MediaAsset } from '~/media/shared/composition-types';

const props = defineProps<{
  background: BackgroundValue | null;
}>();

const mediaFailed = ref(false);
const canvasRef = ref<HTMLCanvasElement | null>(null);
let poster: MediaFrame | null = null;
let loadVersion = 0;

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
  if (background.kind !== 'gradient') return {};

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

const drawPoster = () => {
  const canvas = canvasRef.value;
  if (!canvas || !poster) return;
  canvas.width = poster.width;
  canvas.height = poster.height;
  canvas.getContext('2d')?.drawImage(poster.bitmap, 0, 0);
};

watch(
  () => props.background,
  async (background) => {
    const version = ++loadVersion;
    poster?.close();
    poster = null;
    mediaFailed.value = false;
    if (background?.kind !== 'video') return;
    const asset: MediaAsset = {
      id: background.id,
      kind: 'video',
      name: background.name,
      fileName: background.fileName ?? null,
      durationMs: 0,
      width: null,
      height: null,
      src: resolvePublicAssetUrl(background.path),
      origin: 'project',
    };
    try {
      const frame = await decodeVideoPoster(mediaSourceDescriptor(asset), { position: 0.5, width: 640 });
      if (version !== loadVersion) {
        frame.close();
        return;
      }
      poster = frame;
      await nextTick();
      drawPoster();
    } catch {
      if (version === loadVersion) mediaFailed.value = true;
    }
  },
  { immediate: true, deep: true },
);

onUnmounted(() => {
  loadVersion += 1;
  poster?.close();
  poster = null;
});
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
    <canvas
      v-else-if="background?.kind === 'video' && !mediaFailed"
      ref="canvasRef"
      class="ambient-media ambient-video"
      aria-hidden="true"
    ></canvas>
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
