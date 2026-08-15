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
  draggedClipId,
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
          <div
            v-for="clip in visualClips"
            :key="clip.id"
            class="sidebar-track-item visual-track"
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
          </div>

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
            :class="{ disabled: !systemAudioClips.some((clip) => clip.enabled) }"
          >
            <button type="button" class="track-info" @click="toggleGroup(systemAudioClips)">
              <Volume2 class="track-icon" /><span class="track-title">{{ t('system') }}</span>
            </button>
          </div>

          <div
            v-if="microphoneClips.length"
            class="sidebar-track-item audio-track"
            :class="{ disabled: !microphoneClips.some((clip) => clip.enabled) }"
          >
            <button type="button" class="track-info" @click="toggleGroup(microphoneClips)">
              <Mic class="track-icon" /><span class="track-title">{{ t('mic') }}</span>
            </button>
          </div>

          <div
            v-for="clip in importedAudioClips"
            :key="clip.id"
            class="sidebar-track-item audio-track"
            :class="{ disabled: !clip.enabled }"
          >
            <button type="button" class="track-info" @click="emit('toggle:clip', clip.id)">
              <Volume2 class="track-icon" /><span class="track-title">{{ clip.name }}</span>
            </button>
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
                  d="M0 2C0 0.89543 0.895431 0 2 0H10C11.1046 0 12 0.89543 12 2V7.5C12 8.02701 11.7919 8.53272 11.4216 8.90566L6.5 14.8596L1.57841 8.90566C1.20814 8.53272 1 8.02701 1 7.5V2Z"
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
          <div
            v-for="clip in visualClips"
            :key="clip.id"
            class="track-row visual-track"
            :data-clip-id="clip.id"
            :class="{ disabled: !clip.enabled, dragging: draggedClipId === clip.id }"
          >
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
            :class="{ disabled: !microphoneClips.some((clip) => clip.enabled) }"
          >
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
            :class="{ disabled: !clip.enabled }"
          >
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
