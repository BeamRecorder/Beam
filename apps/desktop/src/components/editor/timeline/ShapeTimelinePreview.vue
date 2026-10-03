<script setup lang="ts">
import { projectFontSource } from '~/api/project-font-source';
import { ImageOff } from '@lucide/vue';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { loadElementFonts } from '@beam/runtime/shared/element-font-loader';
import { useTranslate } from '~/i18n/useTranslate';
import { DEFAULT_OUTPUT_CANVAS } from '@beam/engine/layout/output-canvas';
import { renderShapeTimelinePreview } from './shape-timeline-preview';
import type { ShapeTimelinePreviewProps } from './shape-timeline-preview-types';
import {
  SHAPE_PREVIEW_FIELDS,
  shapePreviewSignature,
  shapePreviewCache,
  retainShapePreviewCache,
} from './shape-preview-cache';

const props = withDefaults(defineProps<ShapeTimelinePreviewProps>(), {
  canvas: () => DEFAULT_OUTPUT_CANVAS,
  presentation: 'timeline',
});
const { t } = useTranslate('ScreenshotComposition');
const preview = ref('');
const error = ref('');
let mounted = false;
let frame = 0;
let revision = 0;
let signature = '';
const releaseCache = retainShapePreviewCache();

const draw = async () => {
  frame = 0;
  const current = revision;
  const clip = props.clip;
  const canvas = props.canvas;
  try {
    const value = await shapePreviewCache.get(signature, async (isCurrent) => {
      await loadElementFonts([clip], projectFontSource);
      if (!isCurrent()) throw new Error('The element preview was cancelled.');
      return renderShapeTimelinePreview(clip, canvas);
    });
    if (!mounted || current !== revision) return;
    preview.value = value;
    error.value = '';
  } catch (cause) {
    if (!mounted || current !== revision) return;
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
};
const schedule = () => {
  const next = shapePreviewSignature(props.clip, props.canvas);
  // Composition edits clone clips, including otherwise unchanged text and paths.
  if (next === signature) return;
  signature = next;
  revision += 1;
  if (mounted && !frame) frame = requestAnimationFrame(() => void draw());
};
// Placement, clip timing and timeline zoom do not change the element's artwork.
watch(
  [
    ...SHAPE_PREVIEW_FIELDS.map((field) => () => props.clip[field]),
    () => props.clip.transform.width,
    () => props.clip.transform.height,
    () => props.canvas.width,
    () => props.canvas.height,
  ],
  schedule,
);
onMounted(() => {
  mounted = true;
  schedule();
});
onUnmounted(() => {
  mounted = false;
  revision += 1;
  cancelAnimationFrame(frame);
  releaseCache();
});
</script>

<template>
  <span class="shape-preview-wrap" :class="{ 'is-thumbnail': presentation === 'thumbnail' }" aria-hidden="true">
    <span v-if="preview" class="shape-preview" :style="{ backgroundImage: `url(${JSON.stringify(preview)})` }" />
    <ImageOff v-if="error" class="preview-status" :size="16" :aria-label="t('previewError')" :title="error" />
    <span v-else-if="!preview" class="preview-status">{{ t('previewLoading') }}</span>
  </span>
</template>

<style scoped>
.shape-preview-wrap {
  display: block;
  position: absolute;
  inset: 3px 5px;
  overflow: hidden;
}
.shape-preview {
  display: block;
  width: 100%;
  height: 100%;
  background-position: left center;
  background-repeat: repeat-x;
  background-size: auto 100%;
}
.preview-status {
  position: absolute;
  inset: 0;
  margin: auto;
  display: grid;
  place-items: center;
  font-size: 9px;
  color: var(--text-muted);
}
.shape-preview-wrap.is-thumbnail {
  position: relative;
  inset: auto;
  width: 38px;
  height: 28px;
}
.is-thumbnail .shape-preview {
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
}
</style>
