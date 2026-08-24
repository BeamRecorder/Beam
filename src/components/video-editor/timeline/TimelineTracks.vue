<script setup lang="ts">
import TimelineClip from './TimelineClip.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useTimelineTracks } from './composables/useTimelineTracks';
import { useTimelineContextMenu } from './composables/useTimelineContextMenu';
import ContextMenu from '~/components/ui/context-menu/ContextMenu.vue';
import { computed } from 'vue';
import TimelineCaptionTracks from './TimelineCaptionTracks.vue';
import type { TimelineTracksEmits, TimelineTracksProps } from './composables/timeline-tracks-types';
import TimelineCanvasTransitionTrack from './TimelineCanvasTransitionTrack.vue';
import { EMPTY_CLIP_TRANSITIONS } from '~/media/shared/clip-transitions';
import { DEFAULT_OUTPUT_CANVAS } from '../canvas/output-canvas';
import { useTimelineClipboardShortcuts } from './composables/useTimelineClipboardShortcuts';
import TimelineTrackHeaders from './TimelineTrackHeaders.vue';
const { t } = useTranslate('TimelineTracks');
const props = withDefaults(defineProps<TimelineTracksProps>(), {
  isSnappingEnabled: true,
  includeAudioInExport: true,
  projectId: null,
  recentPaste: null,
  selectedClipIds: () => [],
  canvas: () => ({ ...DEFAULT_OUTPUT_CANVAS, transitions: { ...EMPTY_CLIP_TRANSITIONS } }),
});
const emit = defineEmits<TimelineTracksEmits>();
const {
  layoutDurationMs,
  visualTracks,
  keyboardCaptionClips,
  textCaptionLayers,
  systemAudioClips,
  microphoneClips,
  importedAudioTracks,
  assetFor,
  audioWaveforms,
  audioWaveformErrors,
  audioWaveformStatus,
  tracksScrollRef,
  sidebarScrollRef,
  tracksViewportRef,
  ticksAreaRef,
  rulerWidth,
  tracksWidthStyle,
  playheadStyle,
  rulerSeconds,
  rulerMarkerStyle,
  isRulerLabel,
  formatRulerLabel,
  thumbnailSlots,
  isWheelZooming,
  onScroll,
  percentageStyle,
  beginScrub,
  handleWheel,
  activeTrimState,
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
  hoverZoomDurationMs,
  hoverCaptionTimeMs,
  hoverCaptionDurationMs,
  hoverAt,
  leaveTrack,
  addAt,
  selectTrack,
  zoomScale,
  draggedTrackId,
  beginReorder,
  draggedCaptionId,
  beginCaptionReorder,
} = useTimelineTracks(props, emit);
void [tracksScrollRef, sidebarScrollRef, tracksViewportRef, ticksAreaRef];
const selectedClipIdSet = computed(
  () =>
    new Set(props.selectedClipIds?.length ? props.selectedClipIds : props.selectedClipId ? [props.selectedClipId] : []),
);
const {
  contextMenuState,
  contextMenuItems,
  openClipContextMenu,
  openZoomContextMenu,
  openTrackContextMenu,
  closeContextMenu,
  handleContextMenuSelect,
  copySelected,
  pasteClipboard,
} = useTimelineContextMenu({
  scopeId: computed(() => props.projectId ?? null),
  currentTimeMs: computed(() => Math.round(props.currentTime * 1_000)),
  composition: computed(() => props.composition),
  zoomElements: computed(() => props.zoomElements),
  selectedClipId: computed(() => props.selectedClipId),
  selectedClipIds: computed(() => [...selectedClipIdSet.value]),
  selectedZoomId: computed(() => props.selectedZoomId),
  assetFor,
  emit,
  t,
});
useTimelineClipboardShortcuts({
  composition: () => props.composition,
  selectedClipId: () => props.selectedClipId,
  selectedZoomId: () => props.selectedZoomId,
  copySelected,
  pasteClipboard,
});
const exportProgressPercent = computed(() => {
  const current = props.exportProgress?.currentTimeMs;
  const total = props.exportProgress?.totalTimeMs;
  if (current === undefined || total === undefined || total <= 0) return null;
  return Math.min(100, Math.max(0, (current / total) * 100));
});
const canvasTransitions = computed(() => props.canvas.transitions ?? EMPTY_CLIP_TRANSITIONS);
const hasCanvasTransitions = computed(() => Boolean(canvasTransitions.value.entry || canvasTransitions.value.exit));
const updateCanvasTransitions = (transitions: NonNullable<typeof props.canvas.transitions>) =>
  emit('update:canvas', { ...props.canvas, transitions });
const previewCanvasTransitions = (transitions: NonNullable<typeof props.canvas.transitions> | null) =>
  emit('preview:canvas', transitions ? { ...props.canvas, transitions } : null);
</script>
<template>
  <div class="timeline-root" @wheel="handleWheel">
    <div class="timeline-sidebar">
      <div class="sidebar-ruler-spacer" />
      <div ref="sidebarScrollRef" class="sidebar-tracks-viewport">
        <div class="sidebar-tracks-stack">
          <TimelineCanvasTransitionTrack
            v-if="hasCanvasTransitions"
            mode="sidebar"
            :transitions="canvasTransitions"
            :duration-ms="layoutDurationMs"
            @open="emit('open:canvas-transition', $event)"
          />
          <TimelineTrackHeaders
            :visual-tracks="visualTracks"
            :keyboard-caption-clips="keyboardCaptionClips"
            :text-caption-layers="textCaptionLayers"
            :system-audio-clips="systemAudioClips"
            :microphone-clips="microphoneClips"
            :imported-audio-tracks="importedAudioTracks"
            :include-audio-in-export="includeAudioInExport"
            :dragged-track-id="draggedTrackId"
            :dragged-caption-id="draggedCaptionId"
            :select-track="selectTrack"
            :begin-reorder="beginReorder"
            :begin-caption-reorder="beginCaptionReorder"
            :open-track-context-menu="openTrackContextMenu"
          />
        </div>
      </div>
    </div>
    <div ref="tracksScrollRef" class="timeline-tracks-container" @scroll="onScroll">
      <div
        ref="tracksViewportRef"
        class="timeline-viewport"
        :class="{ 'is-trimming': activeTrimState !== null, 'is-wheel-zooming': isWheelZooming }"
        :style="tracksWidthStyle"
      >
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
          <TimelineCanvasTransitionTrack
            v-if="hasCanvasTransitions"
            mode="track"
            :transitions="canvasTransitions"
            :duration-ms="layoutDurationMs"
            @open="emit('open:canvas-transition', $event)"
            @preview="previewCanvasTransitions"
            @update="updateCanvasTransitions"
          />
          <TransitionGroup name="track-reorder" tag="div" class="visual-tracks-group">
            <div
              v-for="track in visualTracks"
              :key="track.id"
              class="track-row visual-track"
              :data-track-id="track.id"
              :class="{ disabled: !track.clips.some((clip) => clip.enabled), dragging: draggedTrackId === track.id }"
              @contextmenu="openTrackContextMenu($event, 'visual', track.id)"
            >
              <div class="track-content visual-content">
                <TimelineClip
                  v-for="clip in track.clips"
                  :key="clip.id"
                  :clip="displayedClip(clip)"
                  :asset="assetFor(clip)"
                  :duration="layoutDurationMs / 1000"
                  :timeline-width-px="rulerWidth"
                  :thumbnail-slots="thumbnailSlots"
                  :defer-thumbnail-requests="
                    isWheelZooming || activeTrimState !== null || movingClipIds.includes(clip.id)
                  "
                  :defer-waveform-draw="isWheelZooming"
                  :selected="selectedClipIdSet.has(clip.id)"
                  :trim-state="trimStateFor(clip.id)"
                  :paste-highlight="recentPaste?.type === 'clip' && recentPaste.id === clip.id"
                  @select="emit('select:clip', clip.id)"
                  @contextmenu="openClipContextMenu($event, clip)"
                  @move="beginClipMove($event, clip)"
                  @trim="beginClipTrim($event.event, clip, $event.edge)"
                />
              </div>
            </div>
          </TransitionGroup>
          <div class="track-row cursor-track" @contextmenu="openTrackContextMenu($event, 'zoom')">
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
                :style="percentageStyle(hoverZoomTimeMs, hoverZoomDurationMs)"
              >
                {{ t('addZoom') }}
              </div>
              <button
                v-for="zoom in zoomElements"
                :key="zoom.id"
                type="button"
                class="cursor-zoom-indicator"
                :class="{
                  selected: selectedZoomId === zoom.id,
                  'paste-arrival': recentPaste?.type === 'zoom' && recentPaste.id === zoom.id,
                }"
                :style="
                  percentageStyle(displayedZoom(zoom).startMs, displayedZoom(zoom).endMs - displayedZoom(zoom).startMs)
                "
                @click.stop="emit('select:zoom', zoom.id)"
                @contextmenu.prevent.stop="openZoomContextMenu($event, zoom)"
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
            :text-layers="textCaptionLayers"
            :dragged-caption-id="draggedCaptionId"
            :selected-clip-id="selectedClipId"
            :selected-clip-ids="[...selectedClipIdSet]"
            :hover-caption-time-ms="hoverCaptionTimeMs"
            :hover-caption-duration-ms="hoverCaptionDurationMs"
            :percentage-style="percentageStyle"
            :displayed-clip="displayedClip"
            :trim-state-for="trimStateFor"
            :begin-clip-move="beginClipMove"
            :begin-clip-trim="beginClipTrim"
            :hover-at="hoverAt"
            :leave-track="leaveTrack"
            :add-at="addAt"
            :recent-paste="recentPaste"
            @select="emit('select:clip', $event)"
            @contextmenu:clip="openClipContextMenu($event.event, $event.clip)"
            @contextmenu:track="openTrackContextMenu($event, 'caption')"
          />
          <div
            v-if="systemAudioClips.length"
            class="track-row audio-track"
            :class="{ disabled: !includeAudioInExport || !systemAudioClips.some((clip) => clip.enabled) }"
            @contextmenu="openTrackContextMenu($event, 'audio')"
          >
            <div class="track-content audio-content">
              <span v-if="!includeAudioInExport" class="export-audio-disabled">{{ t('audioDisabledFromExport') }}</span>
              <TimelineClip
                v-for="clip in systemAudioClips"
                :key="clip.id"
                :clip="displayedClip(clip)"
                :asset="assetFor(clip)"
                :duration="layoutDurationMs / 1000"
                :timeline-width-px="rulerWidth"
                :thumbnail-slots="thumbnailSlots"
                :defer-thumbnail-requests="isWheelZooming || activeTrimState !== null"
                :defer-waveform-draw="isWheelZooming"
                :selected="selectedClipIdSet.has(clip.id)"
                :waveform-bars="audioWaveforms[clip.id]?.bars"
                :waveform-left-percent="audioWaveforms[clip.id]?.leftPercent"
                :waveform-width-percent="audioWaveforms[clip.id]?.widthPercent"
                :waveform-loading-segments="audioWaveforms[clip.id]?.loadingSegments"
                :waveform-status="audioWaveformStatus[clip.id]"
                :waveform-error="audioWaveformErrors[clip.id]"
                :trim-state="trimStateFor(clip.id)"
                :paste-highlight="recentPaste?.type === 'clip' && recentPaste.id === clip.id"
                @select="emit('select:clip', clip.id)"
                @contextmenu="openClipContextMenu($event, clip)"
                @move="beginClipMove($event, clip)"
                @trim="beginClipTrim($event.event, clip, $event.edge)"
              />
            </div>
          </div>
          <div
            v-if="microphoneClips.length"
            class="track-row audio-track"
            :class="{ disabled: !includeAudioInExport || !microphoneClips.some((clip) => clip.enabled) }"
            @contextmenu="openTrackContextMenu($event, 'audio')"
          >
            <div class="track-content audio-content">
              <span v-if="!includeAudioInExport" class="export-audio-disabled">{{ t('audioDisabledFromExport') }}</span>
              <TimelineClip
                v-for="clip in microphoneClips"
                :key="clip.id"
                :clip="displayedClip(clip)"
                :asset="assetFor(clip)"
                :duration="layoutDurationMs / 1000"
                :timeline-width-px="rulerWidth"
                :thumbnail-slots="thumbnailSlots"
                :defer-thumbnail-requests="isWheelZooming || activeTrimState !== null"
                :defer-waveform-draw="isWheelZooming"
                :selected="selectedClipIdSet.has(clip.id)"
                :waveform-bars="audioWaveforms[clip.id]?.bars"
                :waveform-left-percent="audioWaveforms[clip.id]?.leftPercent"
                :waveform-width-percent="audioWaveforms[clip.id]?.widthPercent"
                :waveform-loading-segments="audioWaveforms[clip.id]?.loadingSegments"
                :waveform-status="audioWaveformStatus[clip.id]"
                :waveform-error="audioWaveformErrors[clip.id]"
                :trim-state="trimStateFor(clip.id)"
                :paste-highlight="recentPaste?.type === 'clip' && recentPaste.id === clip.id"
                @select="emit('select:clip', clip.id)"
                @contextmenu="openClipContextMenu($event, clip)"
                @move="beginClipMove($event, clip)"
                @trim="beginClipTrim($event.event, clip, $event.edge)"
              />
            </div>
          </div>
          <div
            v-for="track in importedAudioTracks"
            :key="track.id"
            class="track-row audio-track"
            :class="{ disabled: !includeAudioInExport || !track.clips.some((clip) => clip.enabled) }"
            @contextmenu="openTrackContextMenu($event, 'audio')"
          >
            <div class="track-content audio-content">
              <span v-if="!includeAudioInExport" class="export-audio-disabled">{{ t('audioDisabledFromExport') }}</span>
              <TimelineClip
                v-for="clip in track.clips"
                :key="clip.id"
                :clip="displayedClip(clip)"
                :asset="assetFor(clip)"
                :duration="layoutDurationMs / 1000"
                :timeline-width-px="rulerWidth"
                :thumbnail-slots="thumbnailSlots"
                :defer-thumbnail-requests="isWheelZooming || activeTrimState !== null"
                :defer-waveform-draw="isWheelZooming"
                :selected="selectedClipIdSet.has(clip.id)"
                :waveform-bars="audioWaveforms[clip.id]?.bars"
                :waveform-left-percent="audioWaveforms[clip.id]?.leftPercent"
                :waveform-width-percent="audioWaveforms[clip.id]?.widthPercent"
                :waveform-loading-segments="audioWaveforms[clip.id]?.loadingSegments"
                :waveform-status="audioWaveformStatus[clip.id]"
                :waveform-error="audioWaveformErrors[clip.id]"
                :trim-state="trimStateFor(clip.id)"
                :paste-highlight="recentPaste?.type === 'clip' && recentPaste.id === clip.id"
                @select="emit('select:clip', clip.id)"
                @contextmenu="openClipContextMenu($event, clip)"
                @move="beginClipMove($event, clip)"
                @trim="beginClipTrim($event.event, clip, $event.edge)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- Track & Clip Context Menu -->
    <ContextMenu
      :is-open="contextMenuState.isOpen"
      :x="contextMenuState.x"
      :y="contextMenuState.y"
      :items="contextMenuItems"
      @select="handleContextMenuSelect"
      @close="closeContextMenu"
    />
  </div>
</template>
<style scoped src="./timeline-tracks.css"></style>
<style src="./timeline-paste-feedback.css"></style>
