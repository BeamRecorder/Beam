<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import { ImageOff } from '@lucide/vue';
import type { PresetKind } from '@beam/engine/capture/capture-mode';
import type { EditorPresetSettings } from '~/api/types/editor-preset';
import type { MediaFrame } from '@beam/runtime/shared/media-types';
import { outputPreviewRect } from '@beam/engine/layout/output-canvas';
import { createScreenshotImageLoader } from '@beam/runtime/screenshot/screenshot-image-loader';
import { renderPresetPreview } from '@beam/runtime/presets/render-preset-preview';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import { useTranslate } from '~/i18n/useTranslate';
import Skeleton from '~/ui/skeleton/Skeleton.vue';
import { presetPreviewScene } from './preset-preview-scene';

const props = defineProps<{ settings: EditorPresetSettings; kind: PresetKind; source?: string }>();
const { t } = useTranslate('EditorPresetControls');
const surface = ref<HTMLCanvasElement | null>(null);
const status = ref<'loading' | 'ready' | 'error'>('loading');
const loadImage = createScreenshotImageLoader({ maxEntries: 3, maxDecodedPixels: 8_388_608 });
let generation = 0;
watch(
  () => [surface.value, props.settings, props.kind, props.source] as const,
  async ([canvas, settings, kind, source]) => {
    const current = ++generation;
    status.value = 'loading';
    if (!canvas) return;
    let poster: MediaFrame | null = null;
    try {
      // The Recorder has no captured media yet; use the bundled reference photograph.
      const image = await loadImage(resolvePublicAssetUrl(source ?? '/onboarding/alpine-dawn.webp'));
      if (current !== generation) return;
      const scene = presetPreviewScene(settings, kind, { width: image.naturalWidth, height: image.naturalHeight });
      const background = scene.canvas.showBackground ? scene.background : null;
      let backdrop: CanvasImageSource | null = null;
      if (background?.kind === 'image') backdrop = await loadImage(resolvePublicAssetUrl(background.path));
      if (background?.kind === 'video') {
        const { decodeVideoPoster } = await import('@beam/runtime/playback/video-poster');
        if (current !== generation) return;
        poster = await decodeVideoPoster(
          {
            assetId: background.id,
            kind: 'video',
            url: resolvePublicAssetUrl(background.path),
            label: background.name,
          },
          { timestampSeconds: 0, width: 480 },
        );
        backdrop = poster.bitmap;
      }
      const logo =
        scene.canvas.watermark?.enabled && scene.canvas.watermark.showLogo
          ? await loadImage(resolvePublicAssetUrl('/brand/BeamIcon.webp'))
          : null;
      if (current !== generation) return;
      const size = outputPreviewRect(480, 270, scene.canvas);
      canvas.width = Math.max(1, Math.round(size.width));
      canvas.height = Math.max(1, Math.round(size.height));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Preset preview canvas unavailable.');
      renderPresetPreview(
        context,
        scene,
        {
          image: { source: image, width: image.naturalWidth, height: image.naturalHeight },
          background: backdrop,
          logo,
        },
        canvas.width,
        canvas.height,
      );
      status.value = 'ready';
    } catch {
      if (current === generation) status.value = 'error';
    } finally {
      poster?.close();
    }
  },
  { immediate: true, deep: true, flush: 'post' },
);
onBeforeUnmount(() => {
  generation++;
  loadImage.clear();
});
</script>

<template>
  <span
    class="preset-preview"
    role="img"
    :aria-label="t(status === 'error' ? 'previewUnavailable' : 'preview')"
    :aria-busy="status === 'loading'"
  >
    <canvas ref="surface" v-show="status === 'ready'" aria-hidden="true" />
    <Skeleton v-if="status === 'loading'" width="100%" height="100%" />
    <ImageOff v-else-if="status === 'error'" :size="16" aria-hidden="true" />
  </span>
</template>

<style scoped>
.preset-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 96px;
  height: 54px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: repeating-conic-gradient(var(--color-bg-field) 0% 25%, var(--color-bg-surface-hover) 0% 50%) 0 0 / 8px 8px;
}
canvas {
  display: block;
  max-width: 100%;
  max-height: 100%;
}
</style>
