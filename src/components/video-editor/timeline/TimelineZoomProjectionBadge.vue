<script setup lang="ts">
import { computed } from 'vue';
import { useTranslate } from '~/i18n/useTranslate';
import ZoomTiltPreview from '../zoom/ZoomTiltPreview.vue';
import {
  DEFAULT_ZOOM_TILT_HORIZONTAL,
  DEFAULT_ZOOM_TILT_VERTICAL,
  normalizeZoomProjection,
  normalizeZoomTiltAxis,
  normalizeZoomTiltIntensity,
  type ZoomElement,
} from '@beam/engine/zoom/zoom-types';
import { activeZoomTiltPreset, ZOOM_TILT_PRESETS } from '@beam/engine/zoom/zoom-tilt-presets';

const props = defineProps<{ zoom: ZoomElement }>();
const { t } = useTranslate('ZoomPanel');
const is3d = computed(() => normalizeZoomProjection(props.zoom.projection) === '3d');
const label = computed(() => {
  if (!is3d.value) return t('projection2d');
  const active = activeZoomTiltPreset(props.zoom);
  const preset = ZOOM_TILT_PRESETS.find((value) => value.id === active);
  return t(preset ? preset.labelKey : 'tiltPresetCustom');
});
const preview = computed(() => ({
  intensity: normalizeZoomTiltIntensity(props.zoom.tiltIntensity),
  horizontal: normalizeZoomTiltAxis(props.zoom.tiltHorizontal, DEFAULT_ZOOM_TILT_HORIZONTAL),
  vertical: normalizeZoomTiltAxis(props.zoom.tiltVertical, DEFAULT_ZOOM_TILT_VERTICAL),
}));
</script>

<template>
  <span class="zoom-meta-badge zoom-projection-badge" :title="label" :aria-label="label">
    <ZoomTiltPreview v-if="is3d" :preset="preview" compact />
    <template v-else>{{ label }}</template>
  </span>
</template>
