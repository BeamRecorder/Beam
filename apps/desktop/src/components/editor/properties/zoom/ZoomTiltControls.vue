<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { SlidersHorizontal } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import AdvancedButton from '~/ui/button/AdvancedButton.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import RafRevealTransition from '~/ui/transitions/RafRevealTransition.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { normalizeZoomTiltIntensity, type ZoomElement } from '@beam/engine/zoom/zoom-types';
import {
  ORBIT_PRESETS,
  ORBIT_SETTING_LIMITS,
  activeOrbitPreset,
  applyOrbitPreset,
  normalizeOrbitSettings,
  orbitSettingsForZoom,
} from '@beam/engine/zoom/orbit-settings';
import type { OrbitCameraSettings, OrbitPresetDefinition } from '@beam/engine/zoom/orbit-camera-types';
import ZoomTiltPreview from '../../zoom/ZoomTiltPreview.vue';

const props = defineProps<{ zoom: ZoomElement }>();
const emit = defineEmits<{ update: [zoom: ZoomElement] }>();
const { t } = useTranslate('ZoomPanel');
const controlsId = `zoom-camera-advanced-${useId()}`;
const settings = computed(() => orbitSettingsForZoom(props.zoom));
const activePreset = computed(() => (props.zoom.projection === 'orbit' ? activeOrbitPreset(settings.value) : 'custom'));
const advancedOpen = ref(false);
watch(
  () => props.zoom.id,
  () => {
    advancedOpen.value = props.zoom.projection === 'orbit' && activePreset.value === 'custom';
  },
  { immediate: true },
);
const fields = computed(
  () =>
    [
      'yaw',
      'pitch',
      'roll',
      'pullback',
      'fieldOfView',
      'dolly',
      ...(props.zoom.mode === 'auto' ? ['horizontal', 'vertical', 'responseMs', 'leadMs'] : []),
    ] as (keyof OrbitCameraSettings)[],
);
const percent = (key: keyof OrbitCameraSettings) => key === 'pullback' || key === 'dolly';
const milliseconds = (key: keyof OrbitCameraSettings) => key === 'responseMs' || key === 'leadMs';
const display = (key: keyof OrbitCameraSettings, value: number) => value * (percent(key) ? 100 : 1);
const format = (key: keyof OrbitCameraSettings, value: number) =>
  `${Math.round(value)}${percent(key) ? '%' : milliseconds(key) ? ' ms' : '°'}`;
const label = (key: keyof OrbitCameraSettings) => t(`camera${key.charAt(0).toUpperCase()}${key.slice(1)}`);
const selectPreset = (preset: OrbitPresetDefinition) => {
  advancedOpen.value = false;
  emit('update', applyOrbitPreset(props.zoom, preset));
};
const update = (
  patch: Partial<OrbitCameraSettings>,
  intensity = normalizeZoomTiltIntensity(props.zoom.tiltIntensity),
) => {
  if (props.zoom.locked) return;
  emit('update', {
    ...props.zoom,
    projection: 'orbit',
    orbitSettings: normalizeOrbitSettings({ ...settings.value, ...patch }),
    tiltIntensity: intensity,
    ...(props.zoom.endMs > 1 ? { transition: 'cinematic' as const } : {}),
  });
};
const updateField = (key: keyof OrbitCameraSettings, value: number) =>
  update({ [key]: value / (percent(key) ? 100 : 1) });
</script>

<template>
  <div class="zoom-tilt-controls">
    <div class="preset-heading">
      <span class="section-title">{{ t('cameraPresets') }}</span>
      <AdvancedButton
        :open="advancedOpen"
        :controls="controlsId"
        :label="t('advanced')"
        @update:open="advancedOpen = $event"
      />
    </div>
    <div class="zoom-tilt-presets" :aria-label="t('cameraPresets')" role="group">
      <Button
        v-for="preset in ORBIT_PRESETS"
        :key="preset.id"
        :variant="activePreset === preset.id ? 'selected' : 'outline'"
        size="sm"
        block
        class="tilt-preset-card"
        content-layout="custom"
        align="start"
        wrap
        :disabled="zoom.locked"
        :aria-label="t(preset.labelKey)"
        :aria-pressed="activePreset === preset.id"
        :data-tilt-preset="preset.id"
        @click="selectPreset(preset)"
      >
        <span class="preset-content"
          ><ZoomTiltPreview :orbit="preset.settings" /><span class="preset-label">{{ t(preset.labelKey) }}</span></span
        >
      </Button>
    </div>
    <Button
      class="custom-tilt"
      :variant="activePreset === 'custom' ? 'selected' : 'outline'"
      size="sm"
      block
      :icon="SlidersHorizontal"
      :disabled="zoom.locked"
      :aria-pressed="activePreset === 'custom'"
      :aria-expanded="advancedOpen"
      :aria-controls="controlsId"
      @click="advancedOpen = !advancedOpen"
      >{{ t('tiltPresetCustom') }}</Button
    >
    <RafRevealTransition>
      <div v-if="advancedOpen" :id="controlsId" class="zoom-tilt-advanced">
        <BigSlider
          :model-value="normalizeZoomTiltIntensity(zoom.tiltIntensity) * 100"
          :min="0"
          :max="100"
          :step="1"
          :disabled="zoom.locked"
          :label="t('cameraIntensity')"
          :format-value="(value) => `${Math.round(value)}%`"
          @update:model-value="update({}, Math.max(0, Math.min(1, $event / 100)))"
        />
        <BigSlider
          v-for="key in fields"
          :key="key"
          :model-value="display(key, settings[key])"
          :min="display(key, ORBIT_SETTING_LIMITS[key][0]!)"
          :max="display(key, ORBIT_SETTING_LIMITS[key][1]!)"
          :step="milliseconds(key) ? 10 : 1"
          :disabled="zoom.locked"
          :label="label(key)"
          :format-value="(value) => format(key, value)"
          :data-camera-field="key"
          @update:model-value="updateField(key, $event)"
        />
        <p class="hint">{{ t(zoom.mode === 'auto' ? 'cameraFollowHint' : 'cameraManualHint') }}</p>
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
  font-size: var(--font-size-sm);
  font-weight: var(--weight-title);
  color: var(--text-secondary);
}
.zoom-tilt-presets {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.tilt-preset-card {
  min-width: 0;
  height: auto;
  min-height: 46px;
}
.preset-content {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}
.preset-label {
  flex: 1;
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.25;
}
.hint {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  line-height: 1.45;
}
</style>
