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
  Video,
  Image as ImageIcon,
  Volume2,
  Type,
  CircleDashed,
} from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import PopoverMenuButton from '~/ui/popover/PopoverMenuButton.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Skeleton from '~/ui/skeleton/Skeleton.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { MAX_TIMELINE_ZOOM, MIN_TIMELINE_ZOOM, zoomTimelineByButton } from './composables/timeline-zoom';
import type { PreviewQuality } from '~/media/playback';
import PreviewQualityPopover from './PreviewQualityPopover.vue';
import type { PreviewPerformanceSnapshot } from '../performance/preview-performance-types';

const { t } = useTranslate('TimelineToolbar');

const props = withDefaults(
  defineProps<{
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    zoomLevel: number;
    canSplit?: boolean;
    isSnappingEnabled?: boolean;
    loading?: boolean;
    previewQuality?: PreviewQuality;
    performanceSnapshot?: PreviewPerformanceSnapshot | null;
  }>(),
  { zoomLevel: 100, canSplit: false, isSnappingEnabled: true, loading: false, previewQuality: 'auto' },
);

const emit = defineEmits<{
  (e: 'update:isPlaying', value: boolean): void;
  (e: 'update:currentTime', value: number): void;
  (e: 'update:zoomLevel', value: number): void;
  (e: 'update:isSnappingEnabled', value: boolean): void;
  (e: 'update:previewQuality', value: PreviewQuality): void;
  (e: 'add:element', type: 'video' | 'image' | 'sound' | 'caption' | 'blur'): void;
  (e: 'split'): void;
}>();

const handleAdd = (type: 'video' | 'image' | 'sound' | 'caption' | 'blur') => {
  emit('add:element', type);
};
const addItems = computed(
  () =>
    [
      { id: 'video', label: t('video'), icon: Video },
      { id: 'image', label: t('image'), icon: ImageIcon },
      { id: 'sound', label: t('sound'), icon: Volume2 },
      { id: 'caption', label: t('text'), icon: Type },
      { id: 'blur', label: t('blur'), icon: CircleDashed },
    ] as const,
);

const zoomPercentageText = computed(() => {
  return `${Math.round(props.zoomLevel)}%`;
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
  <div class="timeline-toolbar" :class="{ 'is-loading': loading }">
    <Skeleton
      v-if="loading"
      class="timeline-toolbar-loading-skeleton"
      variant="animated-gradient"
      width="min(560px, calc(100% - 32px))"
      height="36px"
      radius="var(--radius-md)"
      aria-hidden="true"
    />
    <div class="timeline-toolbar-content">
      <!-- Left Section: Add Popover & Tool Group -->
      <div class="left-section">
        <PopoverMenuButton
          :label="t('add')"
          :icon="Plus"
          :items="addItems"
          @select="handleAdd($event as 'video' | 'image' | 'sound' | 'caption' | 'blur')"
        />
        <div class="tools-group">
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
            :variant="isSnappingEnabled ? 'primary' : 'ghost'"
            size="sm"
            icon-only
            :icon="Magnet"
            :tooltip="isSnappingEnabled ? t('snappingOn') : t('snappingOff')"
            class="toolbar-snap-btn"
            @click="emit('update:isSnappingEnabled', !isSnappingEnabled)"
          />
        </div>
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
        <PreviewQualityPopover
          :model-value="previewQuality"
          :performance-snapshot="performanceSnapshot"
          @update:model-value="emit('update:previewQuality', $event)"
        />
        <div class="zoom-controls">
          <Button
            variant="ghost"
            size="sm"
            icon-only
            :icon="ZoomOut"
            :tooltip="t('zoomOut')"
            :disabled="zoomLevel <= MIN_TIMELINE_ZOOM"
            class="zoom-btn"
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
              <BigSlider
                :label="t('zoom') || 'Zoom'"
                :model-value="zoomLevel"
                :min="MIN_TIMELINE_ZOOM"
                :max="MAX_TIMELINE_ZOOM"
                :step="25"
                :default-value="MIN_TIMELINE_ZOOM"
                :format-value="(val) => `${Math.round(val)}%`"
                @update:model-value="emit('update:zoomLevel', $event)"
              />
            </div>
          </Popover>
          <Button
            variant="ghost"
            size="sm"
            icon-only
            :icon="ZoomIn"
            :tooltip="t('zoomIn')"
            :disabled="zoomLevel >= MAX_TIMELINE_ZOOM"
            class="zoom-btn"
            @click="handleZoomIn"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-toolbar {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  padding: 0;
  background: transparent;
  border-bottom: none;
  height: calc(48px * var(--ui-scale-canvas-controls, 1));
  user-select: none;
  gap: 12px;
}

.timeline-toolbar-content {
  zoom: var(--ui-scale-canvas-controls, 1);
  width: 100%;
  height: 48px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  padding: 6px 16px;
  box-sizing: border-box;
}

.timeline-toolbar-loading-skeleton {
  position: absolute;
  top: 6px;
  left: 50%;
  z-index: 2;
  transform: translateX(-50%);
}

.timeline-toolbar.is-loading > :not(.timeline-toolbar-loading-skeleton) {
  visibility: hidden;
}

.left-section {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  justify-content: flex-start;
}

.tools-group {
  display: flex;
  align-items: center;
  gap: 6px;
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
  gap: 6px;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--color-bg-surface-hover);
  padding: 2px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.zoom-percent-trigger {
  height: 28px;
  padding: 0 8px;
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
  padding: 8px;
  min-width: 170px;
  box-sizing: border-box;
}
</style>
