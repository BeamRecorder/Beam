<script setup lang="ts">
import { computed } from 'vue';
import type { CaptureMode } from '~/api/types/capture-mode';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import { useTranslate } from '~/i18n/useTranslate';

const props = withDefaults(defineProps<{ mode: CaptureMode; size?: number; decorative?: boolean }>(), {
  size: 16,
  decorative: false,
});
const { t } = useTranslate('QuickSnipCropBar');
const assets: Record<CaptureMode, string> = {
  studio: 'beam-recorder.svg',
  screenshot: 'beam-screenshot.svg',
  instant: 'beam-instant.svg',
};
const iconStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  maskImage: `url("${resolvePublicAssetUrl(`/icons/capture/${assets[props.mode]}`)}")`,
}));
</script>

<template>
  <span
    class="capture-mode-icon"
    :data-mode="mode"
    :style="iconStyle"
    :role="decorative ? undefined : 'img'"
    :aria-hidden="decorative ? 'true' : undefined"
    :aria-label="decorative ? undefined : t(mode)"
  />
</template>

<style scoped>
.capture-mode-icon {
  display: inline-block;
  flex: none;
  background-color: currentColor;
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
}
</style>
