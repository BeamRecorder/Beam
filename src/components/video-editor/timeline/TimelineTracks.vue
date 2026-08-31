<script setup lang="ts">
import TimelineClip from './TimelineClip.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useTimelineTracks } from './composables/useTimelineTracks';
import { useTimelineContextMenu } from './composables/useTimelineContextMenu';
import ContextMenu from '~/components/ui/context-menu/ContextMenu.vue';
import { computed, type ComponentPublicInstance, type Ref } from 'vue';
import TimelineCaptionTracks from './TimelineCaptionTracks.vue';
import type { TimelineTracksEmits, TimelineTracksProps } from './composables/timeline-tracks-types';
import TimelineCanvasTransitionTrack from './TimelineCanvasTransitionTrack.vue';
import { EMPTY_CLIP_TRANSITIONS } from '~/media/shared/clip-transitions';
import { DEFAULT_OUTPUT_CANVAS } from '../canvas/output-canvas';
import { useTimelineClipboardShortcuts } from './composables/useTimelineClipboardShortcuts';
import TimelineTrackHeaders from './TimelineTrackHeaders.vue';
import { normalizeZoomProjection } from '../zoom/zoom-types';
import TimelineAddMenu from './TimelineAddMenu.vue';
import { useTimelineItemInteractions } from './composables/useTimelineItemInteractions';
import WaveformCanvas from './waveform/WaveformCanvas.vue';
const { t } = useTranslate('TimelineTracks');
const { t: tCanvas } = useTranslate('CanvasPanel');
const { t: tToolbar } = useTranslate('TimelineToolbar');
const props = withDefaults(defineProps<TimelineTracksProps>(), {
  isSnappingEnabled: true,
  includeAudioInExport: true,
  projectId: null,
  recentPaste: null,
  selectedClipIds: () => [],
  selectedZoomIds: () => [],
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
  voiceoverClips,
  importedAudioTracks,
  assetFor,
  audioWaveforms,
  audioWaveformErrors,
  audioWaveformStatus,
  tracksScrollRef,
  sidebarScrollRef,
  tracksViewportRef,
  ticksAreaRef,
  rulerLayoutWidth,
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
  hoverVisualPlacements,
  visualKindFor,
  hoverAt,
  leaveTrack,
  addAt,
  selectTrack,
  selectZoomTrack,
  zoomScale,
  draggedTrackId,
  beginReorder,
  draggedCaptionId,
  beginCaptionReorder,
} = useTimelineTracks(props, emit);
const bindDivRef = (target: Ref<HTMLDivElement | null>) => (element: Element | ComponentPublicInstance | null) => {
  target.value = element instanceof HTMLDivElement ? element : null;
};
const setSidebarScrollElement = bindDivRef(sidebarScrollRef);
const setTracksScrollElement = bindDivRef(tracksScrollRef);
const setTracksViewportElement = bindDivRef(tracksViewportRef);
const setTicksAreaElement = bindDivRef(ticksAreaRef);
const { selectedClipIdSet, selectedZoomIdSet, selectItem, startClipMove, startZoomMove } = useTimelineItemInteractions({
  props,
  emit,
  beginClipMove,
  beginZoomMove,
});
const visualElementLabel = (track: (typeof visualTracks.value)[number]) => {
  const kind = visualKindFor(track);
  return kind === 'color'
    ? tCanvas('color')
    : kind === 'shape'
      ? tCanvas('shapesAndArrows')
      : kind === 'blur'
        ? t('blur')
        : kind === 'image'
          ? tCanvas('image')
          : '';
};
const visualAddLabel = (track: (typeof visualTracks.value)[number]) =>
  `${tToolbar('add')} ${visualElementLabel(track)}`;
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
  selectedZoomIds: computed(() => [...selectedZoomIdSet.value]),
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
const formatExportLimit = (timeMs: number) => {
  const totalSeconds = Math.max(0, timeMs) / 1_000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(2)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${(totalSeconds - minutes * 60).toFixed(2).padStart(5, '0')}`;
};
const exportTimelineState = computed(() => {
  const progress = props.exportProgress;
  if (!progress || !Number.isFinite(progress.totalTimeMs) || progress.totalTimeMs <= 0) return null;
  const limitMs = Math.min(layoutDurationMs.value, Math.max(0, progress.totalTimeMs));
  const currentMs = Number.isFinite(progress.currentTimeMs)
    ? Math.min(limitMs, Math.max(0, progress.currentTimeMs))
    : 0;
  return {
    progressStyle: percentageStyle(0, currentMs),
    limitStyle: { left: percentageStyle(limitMs, 0).left },
    limitLabel: formatExportLimit(limitMs),
    isAtEnd: limitMs >= layoutDurationMs.value,
  };
});
const canvasTransitions = computed(() => props.canvas.transitions ?? EMPTY_CLIP_TRANSITIONS);
const updateCanvasTransitions = (transitions: NonNullable<typeof props.canvas.transitions>) =>
  emit('update:canvas', { ...props.canvas, transitions });
const previewCanvasTransitions = (transitions: NonNullable<typeof props.canvas.transitions> | null) =>
  emit('preview:canvas', transitions ? { ...props.canvas, transitions } : null);
</script>
<template>
  <div class="timeline-root" @wheel="handleWheel">
    <div class="timeline-sidebar">
      <div class="sidebar-ruler-spacer">
        <TimelineAddMenu @add:element="emit('add:element', $event)" />
      </div>
      <div :ref="setSidebarScrollElement" class="sidebar-tracks-viewport">
        <div class="sidebar-tracks-stack">
          <TimelineCanvasTransitionTrack
            v-if="canvasTransitions.entry || canvasTransitions.exit"
            mode="sidebar"
            :transitions="canvasTransitions"
            :duration-ms="layoutDurationMs"
            @open="emit('open:canvas-transition', $event)"
          />
          <TimelineTrackHeaders
            :visual-tracks="visualTracks"
            :zoom-elements="zoomElements"
            :keyboard-caption-clips="keyboardCaptionClips"
            :text-caption-layers="textCaptionLayers"
            :system-audio-clips="systemAudioClips"
            :microphone-clips="microphoneClips"
            :voiceover-clips="voiceoverClips"
            :has-voiceover-draft="Boolean(voiceoverDraft)"
            :imported-audio-tracks="importedAudioTracks"
            :include-audio-in-export="includeAudioInExport"
            :dragged-track-id="draggedTrackId"
            :dragged-caption-id="draggedCaptionId"
            :selected-clip-ids="[...selectedClipIdSet]"
            :selected-zoom-ids="[...selectedZoomIdSet]"
            :select-track="selectTrack"
            :select-zoom-track="selectZoomTrack"
            :begin-reorder="beginReorder"
            :begin-caption-reorder="beginCaptionReorder"
            :open-track-context-menu="openTrackContextMenu"
          />
        </div>
      </div>
    </div>
    <div :ref="setTracksScrollElement" class="timeline-tracks-container" @scroll="onScroll">
      <div
        :ref="setTracksViewportElement"
        class="timeline-viewport"
        :class="{ 'is-trimming': activeTrimState !== null, 'is-wheel-zooming': isWheelZooming }"
        :style="tracksWidthStyle"
      >
        <div class="timeline-ruler">
          <div :ref="setTicksAreaElement" class="ruler-ticks-area" @pointerdown="beginScrub">
            <div
              v-if="exportTimelineState"
              class="ruler-export-progress-bar"
              :style="exportTimelineState.progressStyle"
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
          <div
            v-if="exportTimelineState"
            class="timeline-export-limit"
            :class="{ 'is-at-end': exportTimelineState.isAtEnd }"
            :style="exportTimelineState.limitStyle"
          >
            <span class="timeline-export-limit-badge">{{ exportTimelineState.limitLabel }}</span>
          </div>
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
            v-if="canvasTransitions.entry || canvasTransitions.exit"
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
              <div
                class="track-content visual-content"
                :class="{ 'addable-content': visualKindFor(track) }"
                :title="visualKindFor(track) ? visualAddLabel(track) : undefined"
                @pointerdown.stop
                @mousemove="visualKindFor(track) && hoverAt($event, track)"
                @mouseleave="visualKindFor(track) && leaveTrack(track)"
                @click.stop="visualKindFor(track) && addAt($event, track)"
              >
                <div
                  v-if="hoverVisualPlacements[`visual:${track.id}`]"
                  class="visual-add-indicator preview-ghost"
                  :class="`kind-${visualKindFor(track)}`"
                  :style="
                    percentageStyle(
                      hoverVisualPlacements[`visual:${track.id}`]!.startMs,
                      hoverVisualPlacements[`visual:${track.id}`]!.durationMs,
                    )
                  "
                >
                  + {{ visualAddLabel(track) }}
                </div>
                <TimelineClip
                  v-for="clip in track.clips"
                  :key="clip.id"
                  :clip="displayedClip(clip)"
                  :asset="assetFor(clip)"
                  :duration="layoutDurationMs / 1000"
                  :timeline-width-px="rulerLayoutWidth"
                  :thumbnail-slots="thumbnailSlots"
                  :defer-thumbnail-requests="
                    isWheelZooming || activeTrimState !== null || movingClipIds.includes(clip.id)
                  "
                  :defer-waveform-draw="isWheelZooming"
                  :selected="selectedClipIdSet.has(clip.id)"
                  :trim-state="trimStateFor(clip.id)"
                  :paste-highlight="recentPaste?.type === 'clip' && recentPaste.id === clip.id"
                  @select="selectItem('clip', clip.id, $event)"
                  @contextmenu="openClipContextMenu($event, clip)"
                  @move="startClipMove($event, clip)"
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
                  selected: selectedZoomIdSet.has(zoom.id),
                  'paste-arrival': recentPaste?.type === 'zoom' && recentPaste.id === zoom.id,
                }"
                :style="
                  percentageStyle(displayedZoom(zoom).startMs, displayedZoom(zoom).endMs - displayedZoom(zoom).startMs)
                "
                @click.stop="selectItem('zoom', zoom.id, $event)"
                @contextmenu.prevent.stop="openZoomContextMenu($event, zoom)"
                @pointerdown="startZoomMove($event, zoom)"
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
                <span class="zoom-clip-labels">
                  <span class="zoom-meta-badge zoom-projection-badge">
                    {{ normalizeZoomProjection(zoom.projection) === '3d' ? '3D' : '2D' }}
                  </span>
                  <span class="clip-center-title zoom-title">
                    {{ t('zoomTitle', { level: zoomScale(zoom.depth).toFixed(2) }) }}
                  </span>
                  <span class="zoom-meta-badge zoom-mode-badge">
                    {{ zoom.mode === 'auto' ? t('zoomModeAuto') : t('zoomModeManual') }}
                  </span>
                </span>
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
            :begin-clip-move="startClipMove"
            :begin-clip-trim="beginClipTrim"
            :hover-at="hoverAt"
            :leave-track="leaveTrack"
            :add-at="addAt"
            :recent-paste="recentPaste"
            @select="selectItem('clip', $event.id, $event.event)"
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
                :timeline-width-px="rulerLayoutWidth"
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
                @select="selectItem('clip', clip.id, $event)"
                @contextmenu="openClipContextMenu($event, clip)"
                @move="startClipMove($event, clip)"
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
                :timeline-width-px="rulerLayoutWidth"
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
                @select="selectItem('clip', clip.id, $event)"
                @contextmenu="openClipContextMenu($event, clip)"
                @move="startClipMove($event, clip)"
                @trim="beginClipTrim($event.event, clip, $event.edge)"
              />
            </div>
          </div>
          <div
            v-for="clip in voiceoverClips"
            :key="clip.id"
            class="track-row audio-track voiceover-track"
            :class="{ disabled: !includeAudioInExport || !clip.enabled }"
            @contextmenu="openTrackContextMenu($event, 'audio')"
          >
            <div class="track-content audio-content">
              <span v-if="!includeAudioInExport" class="export-audio-disabled">{{ t('audioDisabledFromExport') }}</span>
              <TimelineClip
                :clip="displayedClip(clip)"
                :asset="assetFor(clip)"
                :duration="layoutDurationMs / 1000"
                :timeline-width-px="rulerLayoutWidth"
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
                @select="selectItem('clip', clip.id, $event)"
                @contextmenu="openClipContextMenu($event, clip)"
                @move="startClipMove($event, clip)"
                @trim="beginClipTrim($event.event, clip, $event.edge)"
              />
            </div>
          </div>
          <div v-if="voiceoverDraft" class="track-row audio-track voiceover-track voiceover-draft-track">
            <div class="track-content audio-content">
              <span v-if="!includeAudioInExport" class="export-audio-disabled">{{ t('audioDisabledFromExport') }}</span>
              <div
                class="voiceover-draft-clip"
                :style="percentageStyle(voiceoverDraft.startMs, voiceoverDraft.durationMs)"
              >
                <WaveformCanvas :bars="voiceoverDraft.bars" selected />
              </div>
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
                :timeline-width-px="rulerLayoutWidth"
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
                @select="selectItem('clip', clip.id, $event)"
                @contextmenu="openClipContextMenu($event, clip)"
                @move="startClipMove($event, clip)"
                @trim="beginClipTrim($event.event, clip, $event.edge)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
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
<style scoped src="./timeline-zoom-badges.css"></style>
<style src="./timeline-paste-feedback.css"></style>
