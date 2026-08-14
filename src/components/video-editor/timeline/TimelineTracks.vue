<script setup lang="ts">
import { GripVertical, Mic, MousePointer, Volume2 } from '@lucide/vue';
import type { ExportProgress } from '../../export/export-types';
import type { ZoomElement } from '../zoom/zoom-types';
import type { ClipComposition } from '~/media/shared/composition-types';
import TimelineClip from './TimelineClip.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useTimelineTracks } from './composables/useTimelineTracks';
import { computed } from 'vue';
import TimelineCaptionTracks from './TimelineCaptionTracks.vue';

const { t } = useTranslate('TimelineTracks');
const props = withDefaults(
  defineProps<{
    currentTime: number;
    duration: number;
    zoomLevel: number;
    exportProgress?: ExportProgress | null;
    zoomElements: ZoomElement[];
    selectedZoomId: string | null;
    composition: ClipComposition;
    selectedClipId: string | null;
    isSnappingEnabled?: boolean;
  }>(),
  { isSnappingEnabled: true },
);
const emit = defineEmits<{
  (event: 'update:currentTime', value: number): void;
  (event: 'update:zoomLevel', value: number): void;
  (event: 'select:zoom', zoomId: string): void;
  (event: 'select:clip', clipId: string): void;
  (event: 'toggle:clip', clipId: string): void;
  (event: 'trim:clip', payload: { id: string; edge: 'start' | 'end'; timeMs: number }): void;
  (event: 'move:clip', payload: { id: string; startMs: number }): void;
  (event: 'trim:zoom', payload: { id: string; edge: 'start' | 'end'; timeMs: number }): void;
  (event: 'move:zoom', payload: { id: string; startMs: number; endMs: number }): void;
  (event: 'add:zoom', timeMs: number): void;
  (event: 'add:caption', timeMs: number): void;
  (event: 'reorder:clip', payload: { id: string; targetIndex: number }): void;
}>();

const {
  durationMs,
  visualClips,
  keyboardCaptionClips,
  textCaptionClips,
  systemAudioClips,
  microphoneClips,
  importedAudioClips,
  assetFor,
  audioWaveforms,
  audioWaveformErrors,
  audioWaveformStatus,
  tracksScrollRef,
  tracksViewportRef,
  ticksAreaRef,
  tracksWidthStyle,
  playheadStyle,
  rulerSeconds,
  rulerMarkerStyle,
  isRulerLabel,
  formatRulerLabel,
  thumbnailSlots,
  onScroll,
  percentageStyle,
  beginScrub,
  handleWheel,
  activeSnapTimeMs,
  movingClipIds,
  displayedClip,
  displayedZoom,
  trimStateFor,
  beginClipMove,
  beginClipTrim,
  beginZoomMove,
  beginZoomTrim,
  hoverZoomTimeMs,
  hoverCaptionTimeMs,
  hoverAt,
  leaveTrack,
  addAt,
  toggleGroup,
  iconForVisual,
  labelForVisual,
  zoomScale,
  draggedClipId,
  beginReorder,
  DEFAULT_ZOOM_DURATION_MS,
  DEFAULT_CAPTION_DURATION_MS,
} = useTimelineTracks(props, emit, t);
void tracksScrollRef;
void tracksViewportRef;
void ticksAreaRef;
const exportProgressPercent = computed(() => {
  const current = props.exportProgress?.currentTimeMs;
  const total = props.exportProgress?.totalTimeMs;
  if (current === undefined || total === undefined || total <= 0) return null;
  return Math.min(100, Math.max(0, (current / total) * 100));
});
</script>

<template>
  <div ref="tracksScrollRef" class="timeline-tracks-container" @scroll="onScroll" @wheel="handleWheel">
    <div ref="tracksViewportRef" class="timeline-viewport" :style="tracksWidthStyle">
      <div class="timeline-ruler">
        <div class="ruler-info-spacer" />
        <div ref="ticksAreaRef" class="ruler-ticks-area" @pointerdown="beginScrub">
          <div
            v-if="exportProgressPercent !== null"
            class="ruler-export-progress-bar"
            :style="{
              width: `${exportProgressPercent}%`,
            }"
          />
          <div
            v-for="second in rulerSeconds"
            :key="second"
            class="ruler-marker"
            :class="{ 'is-major': isRulerLabel(second) }"
            :style="rulerMarkerStyle(second)"
          >
            <span v-if="isRulerLabel(second)" class="marker-label">{{ formatRulerLabel(second) }}</span>
            <span class="marker-tick" />
          </div>
          <div class="timeline-playhead" :style="playheadStyle">
            <div class="playhead-head">
              <svg width="12" height="15" viewBox="0 0 12 15" fill="var(--color-primary)">
                <path
                  d="M0 2C0 0.89543 0.895431 0 2 0H10C11.1046 0 12 0.89543 12 2V7.5C12 8.02701 11.7919 8.53272 11.4216 8.90566L6.5 14.8596L1.57841 8.90566C1.20814 8.53272 1 8.02701 1 7.5V2Z"
                />
              </svg>
            </div>
          </div>
          <div
            v-if="activeSnapTimeMs !== null"
            class="timeline-snap-guide"
            :style="{ left: `${durationMs > 0 ? (activeSnapTimeMs / durationMs) * 100 : 0}%` }"
          >
            <span class="snap-guide-badge">{{ (activeSnapTimeMs / 1000).toFixed(2) }}s</span>
          </div>
        </div>
      </div>

      <div class="tracks-stack">
        <div
          v-for="clip in visualClips"
          :key="clip.id"
          class="track-row visual-track"
          :data-clip-id="clip.id"
          :class="{ disabled: !clip.enabled, dragging: draggedClipId === clip.id }"
        >
          <button type="button" class="track-info" :title="clip.name" @click="emit('toggle:clip', clip.id)">
            <span class="track-drag-handle" @click.stop @pointerdown.stop="beginReorder($event, clip.id)">
              <GripVertical class="track-grip" />
            </span>
            <component :is="iconForVisual(clip)" class="track-icon" />
            <span class="track-title">{{ labelForVisual(clip) }}</span>
          </button>
          <div class="track-content visual-content">
            <TimelineClip
              :clip="displayedClip(clip)"
              :asset="assetFor(clip)"
              :duration="duration"
              :thumbnail-slots="thumbnailSlots"
              :selected="selectedClipId === clip.id"
              :trim-state="trimStateFor(clip.id)"
              :defer-thumbnail-requests="movingClipIds.includes(clip.id)"
              @select="emit('select:clip', clip.id)"
              @move="beginClipMove($event, clip)"
              @trim="beginClipTrim($event.event, clip, $event.edge)"
            />
          </div>
        </div>

        <div class="track-row cursor-track">
          <div class="track-info static-info">
            <MousePointer class="track-icon" /><span class="track-title">{{ t('zooms') }}</span>
          </div>
          <div
            class="track-content cursor-content"
            :title="t('clickToAddZoom')"
            @pointerdown.stop
            @mousemove="hoverAt($event, 'zoom')"
            @mouseleave="leaveTrack('zoom')"
            @click.stop="addAt($event, 'zoom')"
          >
            <div
              v-if="hoverZoomTimeMs !== null"
              class="cursor-zoom-indicator preview-ghost"
              :style="percentageStyle(hoverZoomTimeMs, DEFAULT_ZOOM_DURATION_MS)"
            >
              {{ t('addZoom') }}
            </div>
            <button
              v-for="zoom in zoomElements"
              :key="zoom.id"
              type="button"
              class="cursor-zoom-indicator"
              :class="{ selected: selectedZoomId === zoom.id }"
              :style="
                percentageStyle(displayedZoom(zoom).startMs, displayedZoom(zoom).endMs - displayedZoom(zoom).startMs)
              "
              @click.stop="emit('select:zoom', zoom.id)"
              @pointerdown="beginZoomMove($event, zoom)"
            >
              <span
                class="trim-handle start"
                :title="t('trimStart')"
                @pointerdown.stop="beginZoomTrim($event, zoom, 'start')"
              >
                <span v-if="trimStateFor(zoom.id)?.edge === 'start'" class="trim-side-badge"
                  >{{ (trimStateFor(zoom.id)!.durationMs / 1000).toFixed(1) }}s</span
                >
              </span>
              <span class="clip-center-title">{{ zoomScale(zoom.depth).toFixed(2) }}×</span>
              <span
                class="trim-handle end"
                :title="t('trimEnd')"
                @pointerdown.stop="beginZoomTrim($event, zoom, 'end')"
              >
                <span v-if="trimStateFor(zoom.id)?.edge === 'end'" class="trim-side-badge"
                  >{{ (trimStateFor(zoom.id)!.durationMs / 1000).toFixed(1) }}s</span
                >
              </span>
            </button>
          </div>
        </div>

        <TimelineCaptionTracks
          :keyboard-clips="keyboardCaptionClips"
          :text-clips="textCaptionClips"
          :selected-clip-id="selectedClipId"
          :hover-caption-time-ms="hoverCaptionTimeMs"
          :default-caption-duration-ms="DEFAULT_CAPTION_DURATION_MS"
          :percentage-style="percentageStyle"
          :displayed-clip="displayedClip"
          :trim-state-for="trimStateFor"
          :begin-clip-move="beginClipMove"
          :begin-clip-trim="beginClipTrim"
          :hover-at="hoverAt"
          :leave-track="leaveTrack"
          :add-at="addAt"
          @select="emit('select:clip', $event)"
        />

        <div
          v-if="systemAudioClips.length"
          class="track-row audio-track"
          :class="{ disabled: !systemAudioClips.some((clip) => clip.enabled) }"
        >
          <button type="button" class="track-info" @click="toggleGroup(systemAudioClips)">
            <Volume2 class="track-icon" /><span class="track-title">{{ t('system') }}</span>
          </button>
          <div class="track-content audio-content">
            <TimelineClip
              v-for="clip in systemAudioClips"
              :key="clip.id"
              :clip="displayedClip(clip)"
              :asset="assetFor(clip)"
              :duration="duration"
              :thumbnail-slots="thumbnailSlots"
              :selected="selectedClipId === clip.id"
              :waveform-bars="audioWaveforms[clip.id]?.bars"
              :waveform-left-percent="audioWaveforms[clip.id]?.leftPercent"
              :waveform-width-percent="audioWaveforms[clip.id]?.widthPercent"
              :waveform-status="audioWaveformStatus[clip.id]"
              :waveform-error="audioWaveformErrors[clip.id]"
              :trim-state="trimStateFor(clip.id)"
              @select="emit('select:clip', clip.id)"
              @move="beginClipMove($event, clip)"
              @trim="beginClipTrim($event.event, clip, $event.edge)"
            />
          </div>
        </div>

        <div
          v-if="microphoneClips.length"
          class="track-row audio-track"
          :class="{ disabled: !microphoneClips.some((clip) => clip.enabled) }"
        >
          <button type="button" class="track-info" @click="toggleGroup(microphoneClips)">
            <Mic class="track-icon" /><span class="track-title">{{ t('mic') }}</span>
          </button>
          <div class="track-content audio-content">
            <TimelineClip
              v-for="clip in microphoneClips"
              :key="clip.id"
              :clip="displayedClip(clip)"
              :asset="assetFor(clip)"
              :duration="duration"
              :thumbnail-slots="thumbnailSlots"
              :selected="selectedClipId === clip.id"
              :waveform-bars="audioWaveforms[clip.id]?.bars"
              :waveform-left-percent="audioWaveforms[clip.id]?.leftPercent"
              :waveform-width-percent="audioWaveforms[clip.id]?.widthPercent"
              :waveform-status="audioWaveformStatus[clip.id]"
              :waveform-error="audioWaveformErrors[clip.id]"
              :trim-state="trimStateFor(clip.id)"
              @select="emit('select:clip', clip.id)"
              @move="beginClipMove($event, clip)"
              @trim="beginClipTrim($event.event, clip, $event.edge)"
            />
          </div>
        </div>

        <div
          v-for="clip in importedAudioClips"
          :key="clip.id"
          class="track-row audio-track"
          :class="{ disabled: !clip.enabled }"
        >
          <button type="button" class="track-info" @click="emit('toggle:clip', clip.id)">
            <Volume2 class="track-icon" /><span class="track-title">{{ clip.name }}</span>
          </button>
          <div class="track-content audio-content">
            <TimelineClip
              :clip="displayedClip(clip)"
              :asset="assetFor(clip)"
              :duration="duration"
              :thumbnail-slots="thumbnailSlots"
              :selected="selectedClipId === clip.id"
              :waveform-bars="audioWaveforms[clip.id]?.bars"
              :waveform-left-percent="audioWaveforms[clip.id]?.leftPercent"
              :waveform-width-percent="audioWaveforms[clip.id]?.widthPercent"
              :waveform-status="audioWaveformStatus[clip.id]"
              :waveform-error="audioWaveformErrors[clip.id]"
              :trim-state="trimStateFor(clip.id)"
              @select="emit('select:clip', clip.id)"
              @move="beginClipMove($event, clip)"
              @trim="beginClipTrim($event.event, clip, $event.edge)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-tracks-container {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  border-radius: inherit;
  position: relative;
  user-select: none;
}
.timeline-viewport {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.timeline-ruler {
  height: 28px;
  display: flex;
  background: var(--color-bg-element);
  border-bottom: 1px solid var(--color-border);
}
.ruler-info-spacer {
  width: 120px;
  flex: 0 0 120px;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}
.ruler-ticks-area {
  flex: 1;
  position: relative;
  height: 100%;
  margin-left: 80px;
  margin-right: 150px;
  cursor: ew-resize;
}
.ruler-export-progress-bar {
  position: absolute;
  inset: 0 auto 0 0;
  background: rgba(255, 90, 31, 0.25);
  border-right: 2px solid var(--color-primary);
  pointer-events: none;
  z-index: 4;
}
.ruler-marker {
  position: absolute;
  inset-block: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
}
.marker-label {
  position: absolute;
  top: 4px;
  font-size: 8px;
  font-weight: 700;
  color: var(--text-muted);
  font-family: monospace;
}
.marker-tick {
  width: 1px;
  height: 6px;
  background: var(--color-border-strong);
}
.is-major .marker-tick {
  height: 10px;
  background: var(--color-border-dark);
}
.timeline-playhead {
  position: absolute;
  top: 0;
  left: 0;
  width: 2px;
  height: 600px;
  background: var(--color-primary);
  z-index: 100;
  pointer-events: none;
}
.playhead-head {
  position: absolute;
  top: -3px;
  left: -5px;
  width: 12px;
  height: 15px;
  color: var(--color-primary);
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.3));
  z-index: 101;
}
.timeline-snap-guide {
  position: absolute;
  top: 0;
  width: 2px;
  height: 600px;
  background: var(--color-primary);
  box-shadow: 0 0 10px var(--color-primary);
  z-index: 200;
  pointer-events: none;
}
.snap-guide-badge {
  position: absolute;
  top: 2px;
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: #ffffff;
  font-size: 9px;
  font-weight: 800;
  font-family: monospace;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  z-index: 201;
}
.tracks-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 0;
}
.track-row {
  display: flex;
  align-items: center;
  height: 32px;
  position: relative;
  background: var(--color-bg-element);
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}
.track-row.audio-track {
  height: 48px;
}
.track-row.disabled {
  opacity: 0.35;
}
.track-row.dragging {
  opacity: 0.55;
}
.track-info {
  width: 120px;
  height: 100%;
  flex: 0 0 120px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: 0;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
}
.track-info:hover {
  background: var(--color-bg-surface-hover);
}
.static-info {
  cursor: default;
}
.track-icon {
  width: 13px;
  height: 13px;
  flex: 0 0 auto;
}
.track-grip {
  width: 13px;
  height: 13px;
  color: var(--text-muted);
}
.track-drag-handle {
  display: inline-flex;
  width: 24px;
  height: 100%;
  margin-left: -5px;
  align-items: center;
  justify-content: center;
  cursor: grab;
  touch-action: none;
}
.track-drag-handle:active {
  cursor: grabbing;
}
.track-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.track-content {
  flex: 1;
  height: 100%;
  position: relative;
  overflow: hidden;
  margin-left: 80px;
  margin-right: 150px;
}
.visual-content {
  background: var(--color-track-video-light);
}
.cursor-content {
  background: var(--color-track-cursor-light);
}
.annotation-content {
  background: var(--color-track-annotation-light);
}
.audio-content {
  background: var(--color-track-audio-light);
}
.cursor-zoom-indicator,
.annotation-indicator {
  position: absolute;
  top: 4px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: #fff;
  font-size: 8px;
  font-weight: 700;
  cursor: grab;
  box-shadow: var(--shadow-sm);
  transition:
    transform 0.15s ease,
    border-color 0.15s ease;
  overflow: visible;
}
.cursor-zoom-indicator {
  background: var(--color-track-cursor);
}
.annotation-indicator {
  background: var(--color-track-annotation);
}
.cursor-zoom-indicator:hover,
.annotation-indicator:hover {
  transform: translateY(-1px);
  border-color: #fff;
}
.cursor-zoom-indicator.selected,
.annotation-indicator.selected {
  outline: 2px solid var(--color-primary);
}
.annotation-indicator.disabled {
  opacity: 0.42;
}
.preview-ghost {
  opacity: 0.65;
  border: 1.5px dashed var(--color-primary) !important;
  pointer-events: none;
  z-index: 8;
  box-shadow: 0 0 8px rgba(255, 90, 31, 0.3);
  animation: pulse-ghost 1.2s infinite alternate ease-in-out;
}
@keyframes pulse-ghost {
  from {
    opacity: 0.45;
  }
  to {
    opacity: 0.85;
  }
}
.trim-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  z-index: 20;
  cursor: col-resize;
  background: rgba(255, 255, 255, 0.25);
  transition: background var(--fast) ease;
}
.trim-handle:hover {
  background: var(--color-primary);
}
.trim-handle.start {
  left: 0;
}
.trim-handle.end {
  right: 0;
}
.trim-side-badge {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: #fff;
  font-size: 9px;
  font-weight: 800;
  font-family: monospace;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
.trim-handle.start .trim-side-badge {
  left: 8px;
}
.trim-handle.end .trim-side-badge {
  right: 8px;
}
.clip-center-title {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  pointer-events: none;
  white-space: nowrap;
}
</style>
