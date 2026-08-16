<script setup lang="ts">
import { GripVertical, Keyboard, Mic, MousePointer, Type, Volume2 } from '@lucide/vue';
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
    isPlaying: boolean;
    zoomLevel: number;
    exportProgress?: ExportProgress | null;
    includeAudioInExport?: boolean;
    zoomElements: ZoomElement[];
    selectedZoomId: string | null;
    composition: ClipComposition;
    selectedClipId: string | null;
    isSnappingEnabled?: boolean;
  }>(),
  { isSnappingEnabled: true, includeAudioInExport: true },
);
const emit = defineEmits<{
  (event: 'update:currentTime', value: number): void;
  (event: 'update:zoomLevel', value: number): void;
  (event: 'select:zoom', zoomId: string): void;
  (event: 'select:clip', clipId: string): void;
  (event: 'toggle:clip', clipId: string): void;
  (event: 'delete:clips', clipIds: string[]): void;
  (event: 'trim:clip', payload: { id: string; edge: 'start' | 'end'; timeMs: number }): void;
  (event: 'move:clip', payload: { id: string; startMs: number }): void;
  (event: 'preview:composition', value: ClipComposition | null): void;
  (event: 'trim:zoom', payload: { id: string; edge: 'start' | 'end'; timeMs: number }): void;
  (event: 'move:zoom', payload: { id: string; startMs: number; endMs: number }): void;
  (event: 'add:zoom', timeMs: number): void;
  (event: 'add:caption', timeMs: number): void;
  (event: 'reorder:clip', payload: { id: string; targetIndex: number }): void;
}>();

const {
  visualTracks,
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
  sidebarScrollRef,
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
  draggedTrackId,
  beginReorder,
  DEFAULT_ZOOM_DURATION_MS,
  DEFAULT_CAPTION_DURATION_MS,
} = useTimelineTracks(props, emit, t);
void tracksScrollRef;
void sidebarScrollRef;
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
  <div class="timeline-root" @wheel="handleWheel">
    <div class="timeline-sidebar">
      <div class="sidebar-ruler-spacer" />
      <div ref="sidebarScrollRef" class="sidebar-tracks-viewport">
        <div class="sidebar-tracks-stack">
          <TransitionGroup name="track-reorder" tag="div" class="visual-tracks-group">
            <div
              v-for="track in visualTracks"
              :key="track.id"
              class="sidebar-track-item visual-track"
              :data-track-id="track.id"
              :class="{ disabled: !track.clips.some((clip) => clip.enabled), dragging: draggedTrackId === track.id }"
            >
              <button
                type="button"
                class="track-info"
                :title="track.representative.name"
                @click="toggleGroup(track.clips)"
                @pointerdown="beginReorder($event, track.id, track.representative.id)"
              >
                <span class="track-drag-handle" @click.stop>
                  <GripVertical class="track-grip" />
                </span>
                <component :is="iconForVisual(track.representative)" class="track-icon" />
                <span class="track-title">{{ labelForVisual(track.representative) }}</span>
              </button>
            </div>
          </TransitionGroup>

          <div class="sidebar-track-item cursor-track">
            <div class="track-info static-info">
              <MousePointer class="track-icon" /><span class="track-title">{{ t('zooms') }}</span>
            </div>
          </div>

          <div v-if="keyboardCaptionClips.length" class="sidebar-track-item annotation-track keyboard-caption-track">
            <div class="track-info static-info">
              <Keyboard class="track-icon" /><span class="track-title">{{ t('keyboardCaptions') }}</span>
            </div>
          </div>
          <div class="sidebar-track-item annotation-track text-caption-track">
            <div class="track-info static-info">
              <Type class="track-icon" /><span class="track-title">{{ t('textCaptions') }}</span>
            </div>
          </div>

          <div
            v-if="systemAudioClips.length"
            class="sidebar-track-item audio-track"
            :class="{ disabled: !includeAudioInExport || !systemAudioClips.some((clip) => clip.enabled) }"
          >
            <div class="track-info">
              <Volume2 class="track-icon" /><span class="track-title">{{ t('system') }}</span>
              <span v-if="!includeAudioInExport" class="export-disabled-status">{{
                t('audioDisabledFromExport')
              }}</span>
            </div>
          </div>

          <div
            v-if="microphoneClips.length"
            class="sidebar-track-item audio-track"
            :class="{ disabled: !includeAudioInExport || !microphoneClips.some((clip) => clip.enabled) }"
          >
            <div class="track-info">
              <Mic class="track-icon" /><span class="track-title">{{ t('mic') }}</span>
              <span v-if="!includeAudioInExport" class="export-disabled-status">{{
                t('audioDisabledFromExport')
              }}</span>
            </div>
          </div>

          <div
            v-for="clip in importedAudioClips"
            :key="clip.id"
            class="sidebar-track-item audio-track"
            :class="{ disabled: !includeAudioInExport || !clip.enabled }"
          >
            <div class="track-info">
              <Volume2 class="track-icon" /><span class="track-title">{{ clip.name }}</span>
              <span v-if="!includeAudioInExport" class="export-disabled-status">{{
                t('audioDisabledFromExport')
              }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div ref="tracksScrollRef" class="timeline-tracks-container" @scroll="onScroll">
      <div ref="tracksViewportRef" class="timeline-viewport" :style="tracksWidthStyle">
        <div class="timeline-ruler">
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
          </div>
        </div>

        <div class="timeline-playhead-overlay">
          <div class="timeline-playhead" :style="playheadStyle">
            <div class="playhead-head">
              <svg width="12" height="15" viewBox="0 0 12 15" fill="var(--color-primary)">
                <path
                  d="M0 0H12V7.5C12 8.02701 11.7919 8.53272 11.4216 8.90566L6 14.5L0.57841 8.90566C0.20814 8.53272 0 8.02701 0 7.5V0Z"
                />
              </svg>
            </div>
          </div>
          <div
            v-if="activeSnapTimeMs !== null"
            class="timeline-snap-guide"
            :style="{ left: percentageStyle(activeSnapTimeMs, 0).left }"
          >
            <span class="snap-guide-badge">{{ (activeSnapTimeMs / 1000).toFixed(2) }}s</span>
          </div>
        </div>

        <div class="tracks-stack">
          <TransitionGroup name="track-reorder" tag="div" class="visual-tracks-group">
            <div
              v-for="track in visualTracks"
              :key="track.id"
              class="track-row visual-track"
              :data-track-id="track.id"
              :class="{ disabled: !track.clips.some((clip) => clip.enabled), dragging: draggedTrackId === track.id }"
            >
              <div class="track-content visual-content">
                <TimelineClip
                  v-for="clip in track.clips"
                  :key="clip.id"
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
          </TransitionGroup>

          <div class="track-row cursor-track">
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
            :class="{ disabled: !includeAudioInExport || !systemAudioClips.some((clip) => clip.enabled) }"
          >
            <div class="track-content audio-content">
              <span v-if="!includeAudioInExport" class="export-audio-disabled">{{ t('audioDisabledFromExport') }}</span>
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
                :waveform-loading-segments="audioWaveforms[clip.id]?.loadingSegments"
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
            :class="{ disabled: !includeAudioInExport || !microphoneClips.some((clip) => clip.enabled) }"
          >
            <div class="track-content audio-content">
              <span v-if="!includeAudioInExport" class="export-audio-disabled">{{ t('audioDisabledFromExport') }}</span>
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
                :waveform-loading-segments="audioWaveforms[clip.id]?.loadingSegments"
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
            :class="{ disabled: !includeAudioInExport || !clip.enabled }"
          >
            <div class="track-content audio-content">
              <span v-if="!includeAudioInExport" class="export-audio-disabled">{{ t('audioDisabledFromExport') }}</span>
              <TimelineClip
                :clip="displayedClip(clip)"
                :asset="assetFor(clip)"
                :duration="duration"
                :thumbnail-slots="thumbnailSlots"
                :selected="selectedClipId === clip.id"
                :waveform-bars="audioWaveforms[clip.id]?.bars"
                :waveform-left-percent="audioWaveforms[clip.id]?.leftPercent"
                :waveform-width-percent="audioWaveforms[clip.id]?.widthPercent"
                :waveform-loading-segments="audioWaveforms[clip.id]?.loadingSegments"
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
  </div>
</template>

<style scoped src="./timeline-tracks.css"></style>
