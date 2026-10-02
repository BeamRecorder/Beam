<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { SlidersHorizontal } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import AdvancedButton from '~/ui/button/AdvancedButton.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import RafRevealTransition from '~/ui/transitions/RafRevealTransition.vue';
import { useTranslate } from '~/i18n/useTranslate';
import {
  DEFAULT_ZOOM_TILT_HORIZONTAL,
  DEFAULT_ZOOM_TILT_VERTICAL,
  DEFAULT_ZOOM_TILT_INTENSITY,
  normalizeZoomTiltAxis,
  normalizeZoomTiltIntensity,
  type ZoomElement,
} from '@beam/engine/zoom/zoom-types';
import { ZOOM_TILT_PRESETS, activeZoomTiltPreset, applyZoomTiltPreset } from '@beam/engine/zoom/zoom-tilt-presets';
import type { ZoomTiltPresetDefinition } from '@beam/engine/zoom/zoom-tilt-preset-types';
import ZoomTiltPreview from '../../zoom/ZoomTiltPreview.vue';

const props = defineProps<{ zoom: ZoomElement }>();
const emit = defineEmits<{ update: [zoom: ZoomElement] }>();
const { t } = useTranslate('ZoomPanel');
const controlsId = `zoom-tilt-advanced-${useId()}`;
const activePreset = computed(() => activeZoomTiltPreset(props.zoom));
const advancedOpen = ref(false);
watch(
  [() => props.zoom.id, activePreset],
  () => {
    advancedOpen.value = activePreset.value === 'custom';
  },
  { immediate: true },
);

const selectPreset = (preset: ZoomTiltPresetDefinition) => {
  advancedOpen.value = false;
  emit('update', applyZoomTiltPreset(props.zoom, preset));
};
const selectCustom = () => {
  advancedOpen.value = true;
  emit('update', { ...props.zoom, tiltPreset: 'custom' });
};
const updateIntensity = (value: number) =>
  emit('update', { ...props.zoom, tiltIntensity: Math.min(1, Math.max(0, value / 100)), tiltPreset: 'custom' });
const updateAxis = (axis: 'tiltHorizontal' | 'tiltVertical', value: number) =>
  emit('update', { ...props.zoom, [axis]: Math.min(1, Math.max(-1, value / 100)), tiltPreset: 'custom' });
const formatSignedPercent = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value)}%`;
</script>

<template>
  <div class="zoom-tilt-controls">
    <div class="preset-heading">
      <span class="section-title">{{ t('tiltPreset') }}</span>
      <AdvancedButton
        :open="advancedOpen"
        :controls="controlsId"
        :label="t('advanced')"
        @update:open="advancedOpen = $event"
      />
    </div>
    <div class="zoom-tilt-presets" :aria-label="t('tiltPreset')" role="group">
      <Button
        v-for="preset in ZOOM_TILT_PRESETS"
        :key="preset.id"
        :variant="activePreset === preset.id ? 'selected' : 'outline'"
        size="sm"
        block
        class="tilt-preset-card"
        :aria-label="t(preset.labelKey)"
        :tooltip="t(preset.labelKey)"
        :aria-pressed="activePreset === preset.id"
        :data-tilt-preset="preset.id"
        @click="selectPreset(preset)"
      >
        <ZoomTiltPreview :preset="preset" />
      </Button>
      <Button
        class="custom-tilt"
        :variant="activePreset === 'custom' ? 'selected' : 'outline'"
        size="sm"
        block
        icon-only
        :icon="SlidersHorizontal"
        :tooltip="t('tiltPresetCustom')"
        :aria-label="t('tiltPresetCustom')"
        :aria-pressed="activePreset === 'custom'"
        :aria-expanded="advancedOpen"
        :aria-controls="controlsId"
        @click="selectCustom"
      />
    </div>
    <RafRevealTransition>
      <div v-if="advancedOpen" :id="controlsId" class="zoom-tilt-advanced">
        <BigSlider
          :model-value="normalizeZoomTiltIntensity(zoom.tiltIntensity) * 100"
          :min="0"
          :max="100"
          :step="1"
          :default-value="DEFAULT_ZOOM_TILT_INTENSITY * 100"
          :label="t('tiltIntensity')"
          :format-value="(value) => `${Math.round(value)}%`"
          @update:model-value="updateIntensity"
        />
        <BigSlider
          :model-value="normalizeZoomTiltAxis(zoom.tiltHorizontal, DEFAULT_ZOOM_TILT_HORIZONTAL) * 100"
          :min="-100"
          :max="100"
          :step="1"
          :default-value="DEFAULT_ZOOM_TILT_HORIZONTAL * 100"
          :label="t('tiltHorizontal')"
          :format-value="formatSignedPercent"
          @update:model-value="updateAxis('tiltHorizontal', $event)"
        />
        <BigSlider
          :model-value="normalizeZoomTiltAxis(zoom.tiltVertical, DEFAULT_ZOOM_TILT_VERTICAL) * 100"
          :min="-100"
          :max="100"
          :step="1"
          :default-value="DEFAULT_ZOOM_TILT_VERTICAL * 100"
          :label="t('tiltVertical')"
          :format-value="formatSignedPercent"
          @update:model-value="updateAxis('tiltVertical', $event)"
        />
      </div>
    </RafRevealTransition>
  </div>
</template>

<style scoped>
.zoom-tilt-controls,
.zoom-tilt-advanced {
  display: grid;
  gap: 10px;
}
.preset-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}
.zoom-tilt-presets {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}
.tilt-preset-card {
  min-width: 0;
}
</style>
