<script setup lang="ts">
import { computed } from 'vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import Slider from '~/ui/slider/Slider.vue';
import Switch from '~/ui/switch/Switch.vue';
import type { CameraFramingPreset, CameraLayoutPreset } from '~/media/shared/camera-layout-types';
import { isSplitCameraLayout } from '~/media/shared/camera-layout-types';
import { useTranslate } from '~/i18n/useTranslate';

const props = withDefaults(
  defineProps<{
    layout: CameraLayoutPreset;
    framing: CameraFramingPreset;
    hasLinkedScreen: boolean;
    splitRatio: number;
    splitPadding: number;
    reactToZoom?: boolean;
    supportsSplitLayouts?: boolean;
  }>(),
  { supportsSplitLayouts: true },
);

const emit = defineEmits<{
  (event: 'update:layout', preset: Exclude<CameraLayoutPreset, 'custom'>): void;
  (event: 'update:framing', preset: Exclude<CameraFramingPreset, 'custom'>): void;
  (event: 'update:splitRatio', ratio: number): void;
  (event: 'update:splitPadding', padding: number): void;
  (event: 'update:reactToZoom', enabled: boolean): void;
}>();

const { t } = useTranslate('CameraLayoutPanel');
const layouts = computed<Array<{ id: Exclude<CameraLayoutPreset, 'custom'>; label: string }>>(() => {
  const placements: Array<{ id: Exclude<CameraLayoutPreset, 'custom'>; label: string }> = [
    { id: 'floating-top-left', label: t('topLeft') },
    { id: 'floating-top-right', label: t('topRight') },
    { id: 'floating-bottom-left', label: t('bottomLeft') },
    { id: 'floating-bottom-right', label: t('bottomRight') },
    {
      id: 'floating-center',
      label: t(props.supportsSplitLayouts ? 'largeCenter' : 'visualLargeCenter'),
    },
    {
      id: 'fullscreen',
      label: t(props.supportsSplitLayouts ? 'fullscreen' : 'visualFullscreen'),
    },
  ];
  return props.supportsSplitLayouts === false
    ? placements
    : [
        ...placements,
        { id: 'split-left', label: t('splitLeft') },
        { id: 'split-right', label: t('splitRight') },
        { id: 'split-top', label: t('splitTop') },
        { id: 'split-bottom', label: t('splitBottom') },
      ];
});
const framings = computed<Array<{ id: Exclude<CameraFramingPreset, 'custom'>; label: string }>>(() => [
  { id: 'fill', label: t('fill') },
  { id: 'fit', label: t('fit') },
  { id: 'square', label: t('square') },
  { id: 'portrait', label: '9:16' },
  { id: 'landscape', label: '16:9' },
  { id: 'squircle', label: t('squircle') },
  { id: 'circle', label: t('circle') },
]);
const splitUnavailable = computed(() => props.supportsSplitLayouts !== false && !props.hasLinkedScreen);
</script>

<template>
  <section class="camera-layout-panel" aria-labelledby="camera-layout-title">
    <div class="section-header">
      <span id="camera-layout-title" class="section-title">{{
        t(supportsSplitLayouts === false ? 'visualTitle' : 'title')
      }}</span>
      <span v-if="layout === 'custom'" class="custom-status">{{ t('custom') }}</span>
    </div>
    <div class="layout-grid">
      <Button
        v-for="item in layouts"
        :key="item.id"
        class="layout-button"
        :variant="layout === item.id ? 'primary' : 'outline'"
        size="sm"
        :disabled="isSplitCameraLayout(item.id) && splitUnavailable"
        :tooltip="isSplitCameraLayout(item.id) && splitUnavailable ? t('splitRequiresScreen') : item.label"
        :aria-label="item.label"
        @click="emit('update:layout', item.id)"
      >
        <span class="layout-preview" :class="`layout-${item.id}`" aria-hidden="true">
          <span class="screen-shape" />
          <span class="camera-shape" />
        </span>
      </Button>
    </div>
    <p v-if="supportsSplitLayouts !== false && splitUnavailable" class="layout-hint">{{ t('splitRequiresScreen') }}</p>
    <div v-if="supportsSplitLayouts !== false && isSplitCameraLayout(layout)" class="split-adjustment">
      <span class="section-title">{{ t('splitRatio') }}</span>
      <Slider
        :model-value="Math.round(splitRatio * 100)"
        :min="20"
        :max="80"
        :step="1"
        :disabled="splitUnavailable"
        value-suffix="%"
        size="compact"
        @update:model-value="emit('update:splitRatio', $event / 100)"
      />
      <span class="section-title">{{ t('splitPadding') }}</span>
      <Slider
        :model-value="Math.round(splitPadding * 100)"
        :min="0"
        :max="8"
        :step="1"
        :disabled="splitUnavailable"
        value-suffix="%"
        size="compact"
        @update:model-value="emit('update:splitPadding', $event / 100)"
      />
    </div>

    <div v-if="supportsSplitLayouts !== false" class="zoom-reaction-setting">
      <div class="setting-copy">
        <span class="section-title">{{ t('reactToZoom') }}</span>
        <span class="setting-description">{{ t('reactToZoomDescription') }}</span>
      </div>
      <Switch
        :model-value="reactToZoom ?? true"
        :aria-label="t('reactToZoom')"
        @update:model-value="emit('update:reactToZoom', $event)"
      />
    </div>

    <div class="section-header framing-header">
      <span class="section-title">{{ t('framing') }}</span>
      <span v-if="framing === 'custom'" class="custom-status">{{ t('custom') }}</span>
    </div>
    <ButtonGroup full>
      <Button
        v-for="item in framings"
        :key="item.id"
        :variant="framing === item.id ? 'primary' : 'ghost'"
        size="xs"
        :aria-label="item.label"
        @click="emit('update:framing', item.id)"
      >
        {{ item.label }}
      </Button>
    </ButtonGroup>
  </section>
</template>

<style scoped>
.camera-layout-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
}

.custom-status {
  color: var(--text-muted);
  font-size: 10px;
}

.layout-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}

.layout-button {
  min-width: 0;
}

.layout-preview {
  position: relative;
  display: block;
  width: 30px;
  height: 20px;
  overflow: hidden;
  border: 1px solid currentColor;
  border-radius: 3px;
  opacity: 0.9;
}

.screen-shape,
.camera-shape {
  position: absolute;
  display: block;
}

.screen-shape {
  inset: 2px;
  border-radius: 1px;
  background: currentColor;
  opacity: 0.25;
}

.camera-shape {
  width: 8px;
  height: 8px;
  border: 1px solid currentColor;
  border-radius: 2px;
  background: var(--color-bg-element);
}

.layout-floating-top-left .camera-shape {
  left: 2px;
  top: 2px;
}
.layout-floating-top-right .camera-shape {
  right: 2px;
  top: 2px;
}
.layout-floating-bottom-left .camera-shape {
  left: 2px;
  bottom: 2px;
}
.layout-floating-bottom-right .camera-shape {
  right: 2px;
  bottom: 2px;
}
.layout-floating-center .camera-shape {
  inset: 4px 7px;
  width: auto;
  height: auto;
}
.layout-fullscreen .camera-shape {
  inset: 1px;
  width: auto;
  height: auto;
}
.layout-split-left .camera-shape {
  inset: 1px 50% 1px 1px;
  width: auto;
  height: auto;
  border-radius: 1px 0 0 1px;
}
.layout-split-right .camera-shape {
  inset: 1px 1px 1px 50%;
  width: auto;
  height: auto;
  border-radius: 0 1px 1px 0;
}
.layout-split-top .camera-shape {
  inset: 1px 1px 50% 1px;
  width: auto;
  height: auto;
  border-radius: 1px 1px 0 0;
}
.layout-split-bottom .camera-shape {
  inset: 50% 1px 1px 1px;
  width: auto;
  height: auto;
  border-radius: 0 0 1px 1px;
}

.layout-hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.35;
}

.split-adjustment {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.zoom-reaction-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.setting-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.setting-description {
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.35;
}

.framing-header {
  margin-top: 2px;
}
</style>
