<script setup lang="ts">
import { computed } from 'vue';
import FullscreenSeekBar from './FullscreenSeekBar.vue';
import { formatPlaybackTime } from './playback-time';
import type { PlaybackSeekMode } from '@beam/runtime/playback/index';
import { Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut, Scissors, Magnet, Maximize2 } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Skeleton from '~/ui/skeleton/Skeleton.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { MAX_TIMELINE_ZOOM, MIN_TIMELINE_ZOOM, zoomTimelineByButton } from './composables/timeline-zoom';
import type { PreviewQuality } from '@beam/runtime/playback/index';
import PreviewQualityPopover from './PreviewQualityPopover.vue';
import type { PreviewPerformanceSnapshot } from '../performance/preview-performance-types';
import EditorHistoryControls from '../EditorHistoryControls.vue';

const { t } = useTranslate('TimelineToolbar');

const props = withDefaults(
  defineProps<{
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    zoomLevel: number;
    canSplit?: boolean;
    canUndo?: boolean;
    canRedo?: boolean;
    isSnappingEnabled?: boolean;
    loading?: boolean;
    previewQuality?: PreviewQuality;
    performanceSnapshot?: PreviewPerformanceSnapshot | null;
    isCanvasFullscreen?: boolean;
  }>(),
  {
    zoomLevel: 100,
    canSplit: false,
    canUndo: false,
    canRedo: false,
    isSnappingEnabled: true,
    loading: false,
    previewQuality: 'full',
    isCanvasFullscreen: false,
  },
);

const emit = defineEmits<{
  (e: 'update:isPlaying', value: boolean): void;
  (e: 'update:currentTime', value: number, mode?: PlaybackSeekMode): void;
  (e: 'update:zoomLevel', value: number): void;
  (e: 'update:isSnappingEnabled', value: boolean): void;
  (e: 'update:previewQuality', value: PreviewQuality): void;
  (e: 'split'): void;
  (e: 'undo'): void;
  (e: 'redo'): void;
  (e: 'toggle:canvas-fullscreen'): void;
}>();

const zoomPercentageText = computed(() => {
  return `${Math.round(props.zoomLevel)}%`;
});

const handleZoomReset = () => {
  emit('update:zoomLevel', MIN_TIMELINE_ZOOM);
};

const handleZoomIn = () => {
  emit('update:zoomLevel', zoomTimelineByButton(props.zoomLevel, 1));
};

const handleZoomOut = () => {
  emit('update:zoomLevel', zoomTimelineByButton(props.zoomLevel, -1));
};
const handleFullscreenClick = (event?: MouseEvent) => {
  (event?.currentTarget as HTMLElement | null)?.blur();
  emit('toggle:canvas-fullscreen');
};
</script>

<template>
  <div
    class="timeline-toolbar"
    :class="{
      'is-loading': loading,
      'is-canvas-fullscreen': isCanvasFullscreen,
    }"
  >
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
      <!-- Left Section: Editing tools -->
      <div v-if="!isCanvasFullscreen" class="left-section">
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
            :variant="isSnappingEnabled ? 'selected' : 'ghost'"
            size="sm"
            icon-only
            :icon="Magnet"
            :tooltip="isSnappingEnabled ? t('snappingOn') : t('snappingOff')"
            class="toolbar-snap-btn"
            :aria-pressed="isSnappingEnabled"
            @click="emit('update:isSnappingEnabled', !isSnappingEnabled)"
          />
          <EditorHistoryControls
            :can-undo="canUndo && !loading"
            :can-redo="canRedo && !loading"
            tooltip-position="top"
            @undo="emit('undo')"
            @redo="emit('redo')"
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
            variant="selected"
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
          <span class="time-current">{{ formatPlaybackTime(currentTime) }}</span>
          <span class="time-separator">/</span>
          <span class="time-total">{{ formatPlaybackTime(duration) }}</span>
        </div>
      </div>

      <FullscreenSeekBar
        v-if="isCanvasFullscreen"
        class="fullscreen-seek-bar"
        :current-time="currentTime"
        :duration="duration"
        :loading="loading"
        @seek="(time, mode) => emit('update:currentTime', time, mode)"
      />

      <!-- Right Section: Compact Segmented Zoom with Popover -->
      <div v-if="!isCanvasFullscreen" class="right-section">
        <PreviewQualityPopover
          :model-value="previewQuality"
          :performance-snapshot="performanceSnapshot"
          @update:model-value="emit('update:previewQuality', $event)"
        />
        <Button
          variant="ghost"
          size="sm"
          icon-only
          :icon="Maximize2"
          :tooltip="t('fullscreenPreview')"
          class="toolbar-fullscreen-btn"
          @click="handleFullscreenClick"
        />
        <div class="zoom-controls">
          <span class="zoom-label">{{ t('timelineZoom') }}</span>
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
                :label="t('timelineZoom')"
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
  container-type: inline-size;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  padding: 0;
  background: transparent;
  border-bottom: none;
  min-height: var(--editor-playback-toolbar-height);
  flex: none;
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
  transform: translate3d(-50%, 0, 0);
}

.timeline-toolbar.is-loading > :not(.timeline-toolbar-loading-skeleton) {
  visibility: hidden;
}
.timeline-toolbar.is-canvas-fullscreen .timeline-toolbar-content {
  height: auto;
  min-height: 76px;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}
.timeline-toolbar.is-canvas-fullscreen .center-section {
  grid-column: 1;
  justify-self: center;
}
.fullscreen-seek-bar {
  grid-column: 1;
  width: min(100%, 960px);
  min-width: 0;
  justify-self: center;
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
  border-radius: var(--radius-sm);
  background-color: var(--color-bg-field-active);
}

.play-pause-btn:hover {
  background-color: var(--color-bg-field-hover);
}

.time-display-container {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 600;
  padding: 4px 0;
  font-variant-numeric: tabular-nums;
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
  gap: 10px;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0;
}

.zoom-label {
  margin-right: 4px;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  white-space: nowrap;
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
  font-family: var(--font-sans);
}

.zoom-popover-content {
  padding: 8px;
  min-width: 170px;
  box-sizing: border-box;
}

@container (max-width: 640px) {
  .timeline-toolbar-content {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px;
    padding-inline: 8px;
  }
  .center-section {
    gap: 8px;
  }
  .right-section {
    gap: 6px;
  }
  .zoom-label {
    display: none;
  }
}

@container (max-width: 600px) {
  .timeline-toolbar-content {
    height: 80px;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 4px 8px;
  }
  .center-section {
    justify-self: end;
  }
  .right-section {
    grid-column: 1 / -1;
  }
}

@container (max-width: 380px) {
  .timeline-toolbar-content {
    height: 116px;
    grid-template-columns: minmax(0, 1fr);
  }
  .center-section {
    justify-self: center;
  }
}
</style>
