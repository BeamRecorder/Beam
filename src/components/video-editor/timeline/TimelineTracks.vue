<script setup lang="ts">
import ReorderGroup from '~/ui/transitions/ReorderGroup.vue';
import TimelineGapButtons from './TimelineGapButtons.vue';
import TimelineCanvasClips from './TimelineCanvasClips.vue';
import TimelineSelectionBox from './TimelineSelectionBox.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useTimelineTracks } from './composables/useTimelineTracks';
import { useTimelineContextMenu } from './composables/useTimelineContextMenu';
import ContextMenu from '~/components/ui/context-menu/ContextMenu.vue';
import { computed, watchEffect, type ComponentPublicInstance, type Ref } from 'vue';
import TimelineCaptionTracks from './TimelineCaptionTracks.vue';
import type { TimelineTracksEmits, TimelineTracksProps } from './composables/timeline-tracks-types';
import TimelineCanvasTransitionTrack from './TimelineCanvasTransitionTrack.vue';
import { EMPTY_CLIP_TRANSITIONS } from '~/media/shared/clip-transitions';
import { DEFAULT_OUTPUT_CANVAS } from '../canvas/output-canvas';
import { useTimelineClipboardShortcuts } from './composables/useTimelineClipboardShortcuts';
import TimelineTrackHeaders from './TimelineTrackHeaders.vue';
import TimelineZoomTrack from './TimelineZoomTrack.vue';
import { useTimelineVirtualization } from './composables/useTimelineVirtualization';
import { createTimelineRows } from './composables/create-timeline-rows';
import TimelineAddMenu from './TimelineAddMenu.vue';
import { useTimelineItemInteractions } from './composables/useTimelineItemInteractions';
import TimelineAudioTracks from './TimelineAudioTracks.vue';
import { createTimelineLinkedClipNameResolver } from './timeline-linked-clips';
import { useTimelineVisualLabels } from './composables/useTimelineVisualLabels';
const { t } = useTranslate('TimelineTracks');
const props = withDefaults(defineProps<TimelineTracksProps>(), {
  isSnappingEnabled: true,
  includeAudioInExport: true,
  projectId: null,
  recentPaste: null,
  selectedClipIds: () => [],
  selectedZoomIds: () => [],
  controlsLocked: false,
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
  waveformClipIds,
  audioWaveformErrors,
  audioWaveformStatus,
  tracksScrollRef,
  sidebarScrollRef,
  tracksViewportRef,
  ticksAreaRef,
  rulerLayoutWidth,
  timelineViewport,
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
  isMoving,
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
const {
  selectedClipIdSet,
  selectedZoomIdSet,
  selectedClipList,
  selectedZoomList,
  selectItem,
  startClipMove,
  startZoomMove,
} = useTimelineItemInteractions({
  props,
  emit,
  beginClipMove,
  beginZoomMove,
});
const linkedNames = computed(() => createTimelineLinkedClipNameResolver(props.composition));
const visualAddLabel = useTimelineVisualLabels();
const {
  contextMenuState,
  contextMenuItems,
  openClipContextMenu,
  openZoomContextMenu,
  openTrackContextMenu,
  closeContextMenu,
  handleContextMenuSelect,
  copySelected,
  cutSelected,
  pasteClipboard,
  canPasteClipboard,
} = useTimelineContextMenu({
  scopeId: computed(() => props.projectId ?? null),
  currentTimeMs: computed(() => Math.round(props.currentTime * 1_000)),
  composition: computed(() => props.composition),
  zoomElements: computed(() => props.zoomElements),
  selectedClipId: computed(() => props.selectedClipId),
  selectedClipIds: selectedClipList,
  selectedZoomId: computed(() => props.selectedZoomId),
  selectedZoomIds: selectedZoomList,
  assetFor,
  emit,
  t,
});
useTimelineClipboardShortcuts({
  composition: () => props.composition,
  selectedClipId: () => props.selectedClipId,
  selectedZoomId: () => props.selectedZoomId,
  disabled: () => props.controlsLocked,
  copySelected,
  cutSelected,
  canPaste: canPasteClipboard,
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
const virtual = useTimelineVirtualization({
  scroll: tracksScrollRef,
  durationMs: layoutDurationMs,
  width: rulerLayoutWidth,
  viewport: timelineViewport,
  rows: () =>
    createTimelineRows({
      visualTracks: visualTracks.value,
      zooms: props.zoomElements,
      keyboard: keyboardCaptionClips.value,
      textLayers: textCaptionLayers.value,
      system: systemAudioClips.value,
      microphone: microphoneClips.value,
      voiceovers: voiceoverClips.value,
      importedAudio: importedAudioTracks.value,
      canvasTransition: Boolean(canvasTransitions.value.entry || canvasTransitions.value.exit),
      voiceoverDraft: Boolean(props.voiceoverDraft),
    }),
});
const visualTrackIndex = computed(() => new Map(visualTracks.value.map((track) => [`visual:${track.id}`, track])));
watchEffect(() => {
  waveformClipIds.value = new Set(
    virtual.rows.value
      .filter((row) => row.kind === 'audio')
      .flatMap((row) => virtual.visibleClips(row.clips).map((clip) => clip.id)),
  );
});
const visibleVisualTracks = computed(() =>
  virtual.rows.value.flatMap((row) => {
    const track = visualTrackIndex.value.get(row.id);
    return track ? [track] : [];
  }),
);
const updateCanvasTransitions = (transitions: NonNullable<typeof props.canvas.transitions>) =>
  emit('update:canvas', { ...props.canvas, transitions });
const previewCanvasTransitions = (transitions: NonNullable<typeof props.canvas.transitions> | null) =>
  emit('preview:canvas', transitions ? { ...props.canvas, transitions } : null);
</script>
<template>
  <div class="timeline-root" @wheel="handleWheel" @pointerdown.capture="virtual.captureInteraction">
    <div class="timeline-sidebar">
      <div class="sidebar-ruler-spacer">
        <TimelineAddMenu @add:element="emit('add:element', $event)" />
      </div>
      <div :ref="setSidebarScrollElement" class="sidebar-tracks-viewport">
        <div class="sidebar-tracks-stack" :style="virtual.stackStyle.value">
          <TimelineCanvasTransitionTrack
            v-if="(canvasTransitions.entry || canvasTransitions.exit) && virtual.visibleIds.value.has('canvas')"
            data-timeline-row-id="canvas"
            :style="virtual.rowStyle('canvas')"
            mode="sidebar"
            :viewport="timelineViewport"
            :width="rulerLayoutWidth"
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
            :selected-clip-ids="selectedClipList"
            :selected-zoom-ids="selectedZoomList"
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
        :class="{ 'is-trimming': activeTrimState !== null, 'is-moving': isMoving, 'is-wheel-zooming': isWheelZooming }"
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
        <TimelineSelectionBox
          class="tracks-stack"
          :style="virtual.stackStyle.value"
          :get-targets="virtual.selectionTargets"
          :selection="{ clipIds: selectedClipList, zoomIds: selectedZoomList }"
          @start="closeContextMenu"
          @select="emit('select:box', $event)"
        >
          <TimelineCanvasTransitionTrack
            v-if="(canvasTransitions.entry || canvasTransitions.exit) && virtual.visibleIds.value.has('canvas')"
            data-timeline-row-id="canvas"
            :style="virtual.rowStyle('canvas')"
            mode="track"
            :viewport="timelineViewport"
            :width="rulerLayoutWidth"
            :transitions="canvasTransitions"
            :duration-ms="layoutDurationMs"
            @open="emit('open:canvas-transition', $event)"
            @preview="previewCanvasTransitions"
            @update="updateCanvasTransitions"
          />
          <ReorderGroup :order="visibleVisualTracks.map((track) => track.id)" class="visual-tracks-group">
            <div
              v-for="track in visibleVisualTracks"
              :key="track.id"
              class="track-row visual-track"
              :data-track-id="track.id"
              :data-timeline-row-id="`visual:${track.id}`"
              :style="virtual.rowStyle(`visual:${track.id}`)"
              :class="{ disabled: !track.clips.some((clip) => clip.enabled), dragging: draggedTrackId === track.id }"
              @contextmenu="openTrackContextMenu($event, 'visual', track.id)"
            >
              <div
                class="track-content visual-content"
                :class="{ 'addable-content': visualKindFor(track) }"
                :title="visualKindFor(track) ? visualAddLabel(visualKindFor(track)) : undefined"
                @pointerdown.stop
                @mousemove="visualKindFor(track) && hoverAt($event, track)"
                @mouseleave="visualKindFor(track) && leaveTrack(track)"
                @click.stop="visualKindFor(track) && addAt($event, track)"
                @dblclick.stop="visualKindFor(track) && addAt($event, track)"
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
                  + {{ visualAddLabel(visualKindFor(track)) }}
                </div>
                <TimelineGapButtons
                  v-if="track.clips.some((clip) => ['screen', 'video', 'image', 'webcam'].includes(clip.kind))"
                  :clips="track.clips"
                  :composition="composition"
                  :zoom-elements="zoomElements"
                  :duration-ms="layoutDurationMs"
                  :width-px="rulerLayoutWidth"
                  :moving="isMoving || activeTrimState !== null"
                  @remove="emit('remove:gap', $event)"
                />
                <TimelineCanvasClips
                  :clips="virtual.visibleClips(track.clips)"
                  :displayed-clip="displayedClip"
                  :canvas="canvas"
                  :asset-for="assetFor"
                  :duration-ms="layoutDurationMs"
                  :width="rulerLayoutWidth"
                  :viewport="timelineViewport"
                  :thumbnail-slots="thumbnailSlots"
                  :defer-media="isWheelZooming || activeTrimState !== null || isMoving"
                  :selected-ids="selectedClipIdSet"
                  :linked-names="linkedNames"
                  :trim-state-for="trimStateFor"
                  :paste-id="recentPaste?.type === 'clip' ? recentPaste.id : undefined"
                  @select="(event, clip) => selectItem('clip', clip.id, event)"
                  @contextmenu="openClipContextMenu"
                  @move="startClipMove"
                  @trim="beginClipTrim"
                />
              </div>
            </div>
          </ReorderGroup>
          <TimelineZoomTrack
            :viewport="timelineViewport"
            :zoom-elements="zoomElements"
            :selected-zoom-id-set="selectedZoomIdSet"
            :recent-paste="recentPaste"
            :hover-zoom-time-ms="hoverZoomTimeMs"
            :hover-zoom-duration-ms="hoverZoomDurationMs"
            :layout-duration-ms="layoutDurationMs"
            :ruler-layout-width="rulerLayoutWidth"
            :percentage-style="percentageStyle"
            :displayed-zoom="displayedZoom"
            :trim-state-for="trimStateFor"
            :zoom-scale="zoomScale"
            :open-track-context-menu="openTrackContextMenu"
            :hover-at="hoverAt"
            :leave-track="leaveTrack"
            :add-at="addAt"
            :select-item="selectItem"
            :open-zoom-context-menu="openZoomContextMenu"
            :start-zoom-move="startZoomMove"
            :begin-zoom-trim="beginZoomTrim"
          />
          <TimelineCaptionTracks
            :viewport="timelineViewport"
            :duration-ms="layoutDurationMs"
            :width="rulerLayoutWidth"
            :keyboard-clips="keyboardCaptionClips"
            :text-layers="textCaptionLayers"
            :dragged-caption-id="draggedCaptionId"
            :selected-clip-id="selectedClipId"
            :selected-clip-ids="selectedClipList"
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
          <TimelineAudioTracks
            :viewport="timelineViewport"
            :system-audio-clips="systemAudioClips"
            :microphone-clips="microphoneClips"
            :voiceover-clips="voiceoverClips"
            :imported-audio-tracks="importedAudioTracks"
            :voiceover-draft="voiceoverDraft"
            :composition="composition"
            :zoom-elements="zoomElements"
            :include-audio-in-export="includeAudioInExport"
            :layout-duration-ms="layoutDurationMs"
            :ruler-layout-width="rulerLayoutWidth"
            :thumbnail-slots="thumbnailSlots"
            :is-wheel-zooming="isWheelZooming"
            :is-moving="isMoving"
            :selected-clip-id-set="selectedClipIdSet"
            :recent-paste="recentPaste"
            :audio-waveforms="audioWaveforms"
            :audio-waveform-errors="audioWaveformErrors"
            :audio-waveform-status="audioWaveformStatus"
            :asset-for="assetFor"
            :displayed-clip="displayedClip"
            :trim-state-for="trimStateFor"
            :percentage-style="percentageStyle"
            :select-item="selectItem"
            :start-clip-move="startClipMove"
            :begin-clip-trim="beginClipTrim"
            :open-clip-context-menu="openClipContextMenu"
            :open-track-context-menu="openTrackContextMenu"
            :is-trimming="activeTrimState !== null"
            @remove:gap="emit('remove:gap', $event)"
          />
        </TimelineSelectionBox>
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
<style scoped src="./timeline-indicators.css"></style>
<style scoped src="./timeline-item-states.css"></style>
<style scoped src="./timeline-zoom-badges.css"></style>
<style src="./timeline-paste-feedback.css"></style>
