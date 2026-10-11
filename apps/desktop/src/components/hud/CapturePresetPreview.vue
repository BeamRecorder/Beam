<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { renderCompositionFrame, disposeCompositionRenderer } from '@beam/runtime/rendering/render';
import { decodeVideoPoster } from '@beam/runtime/playback/index';
import { mediaSourceDescriptor } from '@beam/runtime/shared/media-source';
import type { EditorPreset } from '~/api/types/editor-preset';
import type { PresetKind } from '@beam/engine/capture/capture-mode';
import { BACKGROUND_COLORS, BACKGROUND_GRADIENTS, BACKGROUND_MEDIA } from '../editor/composables/backgroundCatalog';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import { useTranslate } from '~/i18n/useTranslate';
import { presetPreviewSnapshot } from './preset-preview';
import { presetSample } from './preset-sample';
const props = defineProps<{ preset: EditorPreset; kind: PresetKind }>();
const { t } = useTranslate('QuickSnipCropBar');
const canvas = ref<HTMLCanvasElement | null>(null);
const error = ref(false);
const loading = ref(true);
let revision = 0;
watch(
  () => [props.preset, props.kind],
  async () => {
    const current = ++revision;
    error.value = false;
    loading.value = true;
    let close: (() => void) | null = null;
    try {
      await nextTick();
      const target = canvas.value;
      if (!target) return;
      const presentation = props.preset.settings.editor.presentation;
      const background =
        presentation?.background ??
        [...BACKGROUND_COLORS, ...BACKGROUND_GRADIENTS, ...BACKGROUND_MEDIA].find(
          (item) => item.id === presentation?.selectedBackgroundId,
        ) ??
        null;
      if (presentation?.canvas.showBackground && presentation.selectedBackgroundId && !background)
        throw new Error('Preset background unavailable');
      const snapshot = presetPreviewSnapshot(props.preset, props.kind, background);
      target.width = snapshot.canvas.width;
      target.height = snapshot.canvas.height;
      const context = target.getContext('2d');
      if (!context) throw new Error('Preset preview canvas unavailable');
      const styles = getComputedStyle(target);
      const sample = presetSample(
        styles.getPropertyValue('--color-bg-app'),
        styles.getPropertyValue('--text-primary'),
        styles.getPropertyValue('--color-primary'),
      );
      let media: CanvasImageSource | null = null;
      let mediaSize = { width: 720, height: 450 };
      if (snapshot.canvas.showBackground && background?.kind === 'image') {
        const image = new Image();
        image.src = resolvePublicAssetUrl(background.path);
        await image.decode();
        media = image;
        mediaSize = { width: image.naturalWidth, height: image.naturalHeight };
      } else if (snapshot.canvas.showBackground && background?.kind === 'video') {
        const frame = await decodeVideoPoster(
          mediaSourceDescriptor({
            id: background.id,
            kind: 'video',
            name: background.name,
            src: resolvePublicAssetUrl(background.path),
          }),
          { position: 0.5, width: 720, height: 450, fit: 'cover' },
        );
        close = () => frame.close();
        media = frame.bitmap;
        mediaSize = { width: frame.bitmap.width, height: frame.bitmap.height };
      }
      if (current !== revision) return;
      const visual = { source: sample, width: sample.width, height: sample.height };
      renderCompositionFrame(
        context,
        props.kind === 'video' ? visual : null,
        snapshot,
        0.5,
        media ? { source: media, ...mediaSize } : null,
        undefined,
        new Map([['preset-sample', visual]]),
      );
    } catch {
      if (current === revision) error.value = true;
    } finally {
      close?.();
      disposeCompositionRenderer();
      if (current === revision) loading.value = false;
    }
  },
  { immediate: true, deep: true },
);
onBeforeUnmount(() => {
  revision++;
});
</script>
<template>
  <div class="preset-preview-card">
    <div class="preset-preview-media">
      <canvas ref="canvas" v-show="!error && !loading" role="img" :aria-label="t('presetPreviewExample')" />
      <span v-if="error" role="status">{{ t('presetPreviewUnavailable') }}</span>
      <span v-else-if="loading" role="status">{{ t('presetPreviewLoading') }}</span>
    </div>
    <span class="preset-preview-note">{{ t('presetPreviewExample') }}</span>
  </div>
</template>
<style scoped>
.preset-preview-card {
  width: min(208px, calc(100vw - 42px));
}
.preset-preview-media {
  height: 126px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--color-bg-app);
}
canvas {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.preset-preview-media > span {
  padding: 12px;
  font-size: 11px;
  font-weight: 400;
  color: var(--text-secondary);
}
.preset-preview-note {
  display: block;
  padding-top: 7px;
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 400;
}
</style>
