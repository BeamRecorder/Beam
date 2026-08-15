<script setup lang="ts">
import { computed } from 'vue';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ZoomIn,
  ZoomOut,
  Plus,
  Scissors,
  Magnet,
  RotateCcw,
  Video,
  Image as ImageIcon,
  Volume2,
  Type,
} from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import Popover from '~/ui/popover/Popover.vue';
import PopoverMenuButton from '~/ui/popover/PopoverMenuButton.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { MAX_TIMELINE_ZOOM, MIN_TIMELINE_ZOOM, zoomTimelineByButton } from './composables/timeline-zoom';

const { t } = useTranslate('TimelineToolbar');

const props = withDefaults(
  defineProps<{
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    zoomLevel: number;
    canSplit?: boolean;
    isSnappingEnabled?: boolean;
  }>(),
  { zoomLevel: 100, canSplit: false, isSnappingEnabled: true },
);

const emit = defineEmits<{
  (e: 'update:isPlaying', value: boolean): void;
  (e: 'update:currentTime', value: number): void;
  (e: 'update:zoomLevel', value: number): void;
  (e: 'update:isSnappingEnabled', value: boolean): void;
  (e: 'add:element', type: 'video' | 'image' | 'sound' | 'caption'): void;
  (e: 'split'): void;
}>();

const handleAdd = (type: 'video' | 'image' | 'sound' | 'caption') => {
  emit('add:element', type);
};
const addItems = computed(
  () =>
    [
      { id: 'video', label: t('video'), icon: Video },
      { id: 'image', label: t('image'), icon: ImageIcon },
      { id: 'sound', label: t('sound'), icon: Volume2 },
      { id: 'caption', label: t('text'), icon: Type },
    ] as const,
);

const zoomPercentageText = computed(() => {
  return `${Math.round(props.zoomLevel)}%`;
});

const zoomPercentage = computed(() => {
  return Math.min(
    100,
    Math.max(0, ((props.zoomLevel - MIN_TIMELINE_ZOOM) / (MAX_TIMELINE_ZOOM - MIN_TIMELINE_ZOOM)) * 100),
  );
});

const formatTime = (time: number) => {
  if (!Number.isFinite(time) || time < 0) time = 0;
  const totalSeconds = Math.floor(time);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const handleZoomReset = () => {
  emit('update:zoomLevel', MIN_TIMELINE_ZOOM);
};

const handleZoomIn = () => {
  emit('update:zoomLevel', zoomTimelineByButton(props.zoomLevel, 1));
};

const handleZoomOut = () => {
  emit('update:zoomLevel', zoomTimelineByButton(props.zoomLevel, -1));
};
</script>

<template>
  <div class="timeline-toolbar">
    <!-- Left Section: Add Popover & Tool Group -->
    <div class="left-section">
      <PopoverMenuButton
        :label="t('add')"
        :icon="Plus"
        :items="addItems"
        @select="handleAdd($event as 'video' | 'image' | 'sound' | 'caption')"
      />
      <ButtonGroup>
        <Button
          variant="ghost"
          size="sm"
          icon-only
          :icon="Scissors"
          :disabled="!canSplit"
          :tooltip="canSplit ? `${t('split')} (S)` : t('selectClipToSplit')"
          class="toolbar-split-btn"
          @click="emit('split')"
        />
        <Button
          variant="ghost"
          size="sm"
          icon-only
          :icon="Magnet"
          :class="{ 'is-active': isSnappingEnabled }"
          :tooltip="isSnappingEnabled ? t('snappingOn') : t('snappingOff')"
          class="toolbar-snap-btn"
          @click="emit('update:isSnappingEnabled', !isSnappingEnabled)"
        />
      </ButtonGroup>
    </div>

    <!-- Center Section: Playback Nav & Time Display -->
    <div class="center-section">
      <div class="nav-controls">
        <Button
          variant="ghost"
          size="sm"
          icon-only
          :icon="SkipBack"
          :tooltip="t('goToStart')"
          @click="emit('update:currentTime', 0)"
        />
        <Button
          variant="primary"
          size="sm"
          icon-only
          :icon="isPlaying ? Pause : Play"
          :tooltip="isPlaying ? t('pause') : t('play')"
          class="play-pause-btn"
          @click="emit('update:isPlaying', !isPlaying)"
        />
        <Button
          variant="ghost"
          size="sm"
          icon-only
          :icon="SkipForward"
          :tooltip="t('goToEnd')"
          @click="emit('update:currentTime', duration)"
        />
      </div>

      <div class="time-display-container">
        <span class="time-current">{{ formatTime(currentTime) }}</span>
        <span class="time-separator">/</span>
        <span class="time-total">{{ formatTime(duration) }}</span>
      </div>
    </div>

    <!-- Right Section: Compact Segmented Zoom with Popover -->
    <div class="right-section">
      <div class="zoom-controls">
        <ButtonGroup class="zoom-button-group">
          <Button
            variant="ghost"
            size="sm"
            icon-only
            :icon="ZoomOut"
            :tooltip="t('zoomOut')"
            :disabled="zoomLevel <= MIN_TIMELINE_ZOOM"
            @click="handleZoomOut"
          />
          <Popover align="right" direction="up" :match-trigger-width="false">
            <template #trigger>
              <button
                type="button"
                class="zoom-percent-trigger"
                :title="t('doubleClickResetZoom')"
                @dblclick="handleZoomReset"
              >
                <span class="zoom-percent-text">{{ zoomPercentageText }}</span>
              </button>
            </template>
            <div class="zoom-popover-content">
              <div class="zoom-popover-header">
                <span class="zoom-popover-title">{{ t('zoom') || 'Zoom' }}</span>
                <Button
                  variant="ghost"
                  size="xs"
                  icon-only
                  :icon="RotateCcw"
                  :tooltip="t('resetZoom') || 'Reset Zoom'"
                  :disabled="zoomLevel === MIN_TIMELINE_ZOOM"
                  class="zoom-reset-btn"
                  @click="handleZoomReset"
                />
              </div>
              <div class="zoom-popover-slider-row">
                <ZoomOut :size="13" class="zoom-slider-icon" />
                <input
                  type="range"
                  :min="MIN_TIMELINE_ZOOM"
                  :max="MAX_TIMELINE_ZOOM"
                  step="25"
                  :value="zoomLevel"
                  class="zoom-slider"
                  :style="{
                    background: `linear-gradient(to right, var(--color-primary, #ff5a1f) ${zoomPercentage}%, var(--color-border, rgba(255, 255, 255, 0.12)) ${zoomPercentage}%)`,
                  }"
                  @input="emit('update:zoomLevel', parseFloat(($event.target as HTMLInputElement).value))"
                />
                <ZoomIn :size="13" class="zoom-slider-icon" />
              </div>
              <div class="zoom-popover-footer">
                <span class="zoom-popover-pct">{{ zoomPercentageText }}</span>
              </div>
            </div>
          </Popover>
          <Button
            variant="ghost"
            size="sm"
            icon-only
            :icon="ZoomIn"
            :tooltip="t('zoomIn')"
            :disabled="zoomLevel >= MAX_TIMELINE_ZOOM"
            @click="handleZoomIn"
          />
        </ButtonGroup>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-toolbar {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 6px 16px;
  background: transparent;
  border-bottom: none;
  height: 48px;
  user-select: none;
  gap: 12px;
}

.left-section {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  justify-content: flex-start;
}

.left-section :deep(.toolbar-snap-btn.is-active) {
  color: var(--color-primary) !important;
  background: var(--color-primary-light, rgba(255, 90, 31, 0.15)) !important;
}

.center-section {
  display: flex;
  align-items: center;
  gap: 14px;
  justify-content: center;
  min-width: 0;
}

.nav-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.play-pause-btn {
  border-radius: var(--radius-full);
  background-color: var(--color-primary);
}

.play-pause-btn:hover {
  background-color: var(--color-primary-hover);
}

.time-display-container {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  font-size: 12px;
  font-weight: 600;
  background: var(--color-bg-surface-hover);
  padding: 4px 10px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  letter-spacing: 0.02em;
}

.time-current {
  color: var(--text-primary);
}

.time-separator {
  color: var(--text-muted);
}

.time-total {
  color: var(--text-secondary);
}

.right-section {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
}

.zoom-controls {
  display: flex;
  align-items: center;
}

.zoom-percent-trigger {
  height: 28px;
  padding: 0 10px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--fast) ease;
  border-radius: var(--radius-sm);
}

.zoom-percent-trigger:hover {
  background: var(--color-bg-surface);
  color: var(--text-primary);
}

.zoom-percent-text {
  font-family: var(--font-mono, monospace);
}

.zoom-popover-content {
  padding: 12px;
  min-width: 190px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.zoom-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.zoom-popover-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.zoom-popover-slider-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.zoom-slider-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.zoom-popover-footer {
  display: flex;
  justify-content: flex-end;
}

.zoom-popover-pct {
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  font-weight: 600;
  color: var(--text-secondary);
}

.zoom-slider {
  -webkit-appearance: none;
  appearance: none;
  flex: 1;
  width: 100%;
  height: 4px;
  border-radius: var(--radius-full);
  outline: none;
  cursor: pointer;
  transition: background 0.05s ease;
}

.zoom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-primary);
  border: none;
  box-shadow: var(--shadow-sm);
  transition: transform 0.1s ease;
}

.zoom-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.zoom-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-primary);
  border: none;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform 0.1s ease;
}

.zoom-slider::-moz-range-thumb:hover {
  transform: scale(1.2);
}
</style>

