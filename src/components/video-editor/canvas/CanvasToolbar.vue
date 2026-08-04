<script setup lang="ts">
import { computed } from 'vue';
import { Crop, Check, ZoomIn, ZoomOut, Grid } from '@lucide/vue';
import PopoverMenuButton from '../../ui/popover/PopoverMenuButton.vue';
import Button from '../../ui/button/Button.vue';
import type { OutputCanvasPreset } from './output-canvas';
import { useTranslate } from '~/i18n/useTranslate';

const { t } = useTranslate('CanvasToolbar');

const props = withDefaults(
  defineProps<{
    preset: OutputCanvasPreset;
    canCrop: boolean;
    isCropping: boolean;
    isGridVisible?: boolean;
    zoomPercent?: number;
    isZoomedOrPanned?: boolean;
  }>(),
  {
    isGridVisible: false,
    zoomPercent: 100,
    isZoomedOrPanned: false,
  },
);

const emit = defineEmits<{
  (event: 'select:preset', preset: Exclude<OutputCanvasPreset, 'custom'>): void;
  (event: 'toggle:crop'): void;
  (event: 'toggle:grid'): void;
  (event: 'zoom:in'): void;
  (event: 'zoom:out'): void;
  (event: 'reset:zoom'): void;
}>();

const presets: Exclude<OutputCanvasPreset, 'custom'>[] = ['16:9', '9:16', '1:1', '4:5', '3:4', '4:3', '21:9'];
const items = computed(() => presets.map((id) => ({ id, label: id, active: props.preset === id })));
</script>

<template>
  <div class="canvas-toolbar">
    <PopoverMenuButton
      transparent
      :label="preset"
      :aria-label="t('formatPreset', { preset })"
      :items="items"
      @select="emit('select:preset', $event as Exclude<OutputCanvasPreset, 'custom'>)"
    />
    <Button
      class="crop-button"
      :variant="isCropping ? 'primary' : 'outline'"
      size="xs"
      :icon="isCropping ? Check : Crop"
      :disabled="!canCrop"
      :tooltip="canCrop ? (isCropping ? t('confirmCrop') : t('cropSelected')) : t('selectElementToCrop')"
      @click="emit('toggle:crop')"
    >
      {{ isCropping ? t('ok') : t('crop') }}
    </Button>

    <div class="toolbar-divider"></div>

    <Button
      variant="ghost"
      size="xs"
      :icon="Grid"
      :aria-label="t('toggleGrid')"
      :tooltip="t('toggleGrid')"
      class="grid-toggle-btn"
      :class="{ 'is-active': isGridVisible }"
      @click="emit('toggle:grid')"
    />

    <div class="zoom-controls">
      <Button
        variant="ghost"
        size="xs"
        :icon="ZoomOut"
        :aria-label="t('zoomOut')"
        :tooltip="t('zoomOut')"
        class="zoom-btn"
        @click="emit('zoom:out')"
      />
      <span
        class="zoom-indicator"
        :class="{ 'is-active': isZoomedOrPanned }"
        :title="t('canvasZoom')"
        @click="emit('reset:zoom')"
      >
        {{ zoomPercent }}%
      </span>
      <Button
        variant="ghost"
        size="xs"
        :icon="ZoomIn"
        :aria-label="t('zoomIn')"
        :tooltip="t('zoomIn')"
        class="zoom-btn"
        @click="emit('zoom:in')"
      />
    </div>
  </div>
</template>

<style scoped>
.canvas-toolbar {
  position: relative;
  z-index: 3;
  height: 44px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 6px 12px;
  background: transparent;
}

.canvas-toolbar :deep(.btn-container) {
  display: inline-flex;
  align-items: center;
  height: 28px;
}

.canvas-toolbar :deep(.btn) {
  height: 28px !important;
  min-height: 28px !important;
  max-height: 28px !important;
  padding: 0 10px !important;
  font: 600 12px var(--font-sans) !important;
  border-radius: var(--radius-md) !important;
  box-sizing: border-box !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  background: transparent;
  box-shadow: var(--shadow-sm);
}

.canvas-toolbar :deep(.crop-button.btn-primary) {
  background: var(--color-primary, #ff5a1f) !important;
  background-color: var(--color-primary, #ff5a1f) !important;
  color: #ffffff !important;
  border-color: var(--color-primary, #ff5a1f) !important;
}

.canvas-toolbar :deep(.crop-button.btn-primary:hover:not(:disabled)) {
  background: var(--color-primary-hover, #e04810) !important;
  background-color: var(--color-primary-hover, #e04810) !important;
  color: #ffffff !important;
}

.canvas-toolbar :deep(.crop-button.btn-outline:hover:not(:disabled)) {
  background: var(--color-primary-light) !important;
  border-color: var(--color-primary) !important;
  color: var(--color-primary) !important;
}

.toolbar-divider {
  width: 1px;
  height: 18px;
  background: var(--color-border, rgba(255, 255, 255, 0.12));
  margin: 0 2px;
}

.canvas-toolbar :deep(.grid-toggle-btn) {
  padding: 0 6px !important;
  min-width: 28px !important;
}

.canvas-toolbar :deep(.grid-toggle-btn.is-active) {
  color: var(--color-primary, #ff5a1f) !important;
  background: var(--color-primary-light, rgba(255, 90, 31, 0.15)) !important;
  border-color: var(--color-primary, #ff5a1f) !important;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 2px;
}

.zoom-controls :deep(.zoom-btn) {
  padding: 0 6px !important;
  min-width: 28px !important;
}

.zoom-indicator {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary, #94a3b8);
  padding: 2px 6px;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
  min-width: 40px;
  text-align: center;
}

.zoom-indicator:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary, #ffffff);
}

.zoom-indicator.is-active {
  color: var(--color-primary, #ff5a1f);
}
</style>
