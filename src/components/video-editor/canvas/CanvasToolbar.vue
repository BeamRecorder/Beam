<script setup lang="ts">
import { computed } from 'vue';
import { Crop, Check, ZoomIn, ZoomOut, Grid, Camera } from '@lucide/vue';
import PopoverMenuButton from '../../ui/popover/PopoverMenuButton.vue';
import Button from '../../ui/button/Button.vue';
import Skeleton from '../../ui/skeleton/Skeleton.vue';
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
    isCapturingScreenshot?: boolean;
    loading?: boolean;
  }>(),
  {
    isGridVisible: false,
    zoomPercent: 100,
    isZoomedOrPanned: false,
    isCapturingScreenshot: false,
    loading: false,
  },
);

const emit = defineEmits<{
  (event: 'select:preset', preset: Exclude<OutputCanvasPreset, 'custom'>): void;
  (event: 'toggle:crop'): void;
  (event: 'toggle:grid'): void;
  (event: 'take:screenshot'): void;
  (event: 'zoom:in'): void;
  (event: 'zoom:out'): void;
  (event: 'reset:zoom'): void;
}>();

const presets: Exclude<OutputCanvasPreset, 'custom'>[] = ['16:9', '9:16', '1:1', '4:5', '3:4', '4:3', '21:9'];
const items = computed(() => presets.map((id) => ({ id, label: id, active: props.preset === id })));
</script>

<template>
  <div class="canvas-toolbar">
    <Transition name="toolbar-ready" mode="out-in">
      <Skeleton
        v-if="loading"
        class="toolbar-loading-skeleton"
        variant="animated-gradient"
        width="280px"
        height="28px"
        radius="var(--radius-sm)"
        aria-hidden="true"
      />
      <div v-else class="toolbar-controls">
        <div class="canvas-format-controls" role="group" :aria-label="t('formatPreset', { preset })">
          <PopoverMenuButton
            transparent
            :label="preset"
            :aria-label="t('formatPreset', { preset })"
            :items="items"
            @select="emit('select:preset', $event as Exclude<OutputCanvasPreset, 'custom'>)"
          />
          <Button
            class="crop-button"
            :variant="isCropping ? 'selected' : 'ghost'"
            size="xs"
            :icon="isCropping ? Check : Crop"
            :disabled="!canCrop"
            :aria-pressed="isCropping"
            :aria-label="isCropping ? t('confirmCrop') : t('cropSelected')"
            :tooltip="canCrop ? (isCropping ? t('confirmCrop') : t('cropSelected')) : t('selectElementToCrop')"
            @click="emit('toggle:crop')"
          >
            <span class="crop-label">{{ isCropping ? t('ok') : t('crop') }}</span>
          </Button>
        </div>
        <div class="canvas-view-controls" role="group" :aria-label="t('canvasZoom')">
          <Button
            :variant="isGridVisible ? 'selected' : 'ghost'"
            size="xs"
            icon-only
            :icon="Grid"
            :aria-label="t('toggleGrid')"
            :aria-pressed="isGridVisible"
            :tooltip="t('toggleGrid')"
            class="grid-toggle-btn"
            @click="emit('toggle:grid')"
          />
          <Button
            variant="ghost"
            size="xs"
            icon-only
            :icon="Camera"
            :loading="isCapturingScreenshot"
            :aria-label="t('takeScreenshot')"
            :tooltip="t('takeScreenshot')"
            class="screenshot-btn"
            @click="emit('take:screenshot')"
          />
          <div class="zoom-controls">
            <span class="zoom-label">{{ t('canvasZoom') }}</span>
            <Button
              variant="ghost"
              size="xs"
              icon-only
              :icon="ZoomOut"
              :aria-label="t('zoomOut')"
              :tooltip="t('zoomOut')"
              class="zoom-btn"
              @click="emit('zoom:out')"
            />
            <button
              type="button"
              class="zoom-indicator"
              :class="{ 'is-active': isZoomedOrPanned }"
              :aria-label="t('resetZoom')"
              :title="t('resetZoom')"
              @click="emit('reset:zoom')"
            >
              {{ zoomPercent }}%
            </button>
            <Button
              variant="ghost"
              size="xs"
              icon-only
              :icon="ZoomIn"
              :aria-label="t('zoomIn')"
              :tooltip="t('zoomIn')"
              class="zoom-btn"
              @click="emit('zoom:in')"
            />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.canvas-toolbar {
  position: relative;
  container-type: inline-size;
  width: 100%;
  z-index: 3;
  height: var(--editor-canvas-toolbar-height);
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 12px;
}
.toolbar-controls {
  zoom: var(--ui-scale-canvas-controls, 1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 16px;
}
.canvas-format-controls,
.canvas-view-controls,
.zoom-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}
.zoom-controls {
  margin-left: 8px;
}
.zoom-label {
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  white-space: nowrap;
}
.zoom-indicator {
  min-width: 44px;
  padding: 4px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font: var(--weight-title) var(--font-size-body) var(--font-sans);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.zoom-indicator:hover,
.zoom-indicator.is-active {
  background: var(--color-bg-field);
  color: var(--text-primary);
}
.zoom-indicator:focus-visible {
  outline: 2px solid var(--text-secondary);
  outline-offset: 2px;
}
.toolbar-ready-enter-active,
.toolbar-ready-leave-active {
  transition: opacity 220ms ease;
}
.toolbar-ready-enter-from,
.toolbar-ready-leave-to {
  opacity: 0;
}

@container (max-width: 500px) {
  .zoom-label {
    display: none;
  }
}

@container (max-width: 430px) {
  .crop-label {
    display: none;
  }
  .toolbar-controls {
    gap: 8px;
  }
  .zoom-controls {
    margin-left: 4px;
  }
}
</style>
