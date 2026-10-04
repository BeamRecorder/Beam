<script setup lang="ts">
import EditorCanvas from '~/components/editor/canvas/EditorCanvas.vue';
import CanvasToolbar from '~/components/editor/canvas/CanvasToolbar.vue';
import TimelineToolbar from '~/components/editor/timeline/TimelineToolbar.vue';
import Button from '~/components/ui/button/Button.vue';
import { ArrowLeft } from '@lucide/vue';
import { isVisualClip } from '@beam/engine/shared/composition-types';
import { useEditorWorkspaceContext } from './workspace-context';
import { toRefs } from 'vue';
import HtmlDomPreview from '~/components/authoring/HtmlDomPreview.vue';
import { capture } from '~/api/capture';
import { sourceTimeAt } from '@beam/engine/shared/timeline-mapping';
import { computed } from 'vue';
const workspace = useEditorWorkspaceContext();
const {
  tTopbarHud,
  tTimelineToolbar,
  activeTab,
  player,
  authoring,
  cursorMotion,
  outputCanvas,
  initialPlaybackSettled,
  isPlaying,
  currentTime,
  duration,
  playbackState,
  playbackError,
  frameVersion,
  previewQuality,
  backgroundBlurPercent,
  performanceSnapshot,
  cursorSelection,
  cursorPack,
  cursorSize,
  cursorColor,
  enableShadow,
  shadowBlur,
  shadowColor,
  shadowDirection,
  clickEffects,
  cursorAutoHide,
  renderedBackground,
  selectedClipIds,
  splitSelectedClip,
  zoomElements,
  selectedZoomId,
  selectedZoom,
  zoomMotionBlur,
  zoomAutoFollow,
  timelineZoomPreview,
  cursorPreview,
  transformHandlesMuted,
  previewCrop,
  canvasComposition,
  renderedOutputCanvas,
  editLocked,
  selectedTransformClip,
  historyAction,
  undo,
  redo,
  canUndo,
  canRedo,
  isVoiceoverOpen,
  timelineDisplayDuration,
  beginInlineCaptionEditing,
  endInlineCaptionEditing,
  selectEditorClip,
  selectEditorTrack,
  selectEditorCanvas,
  selectEditorCursor,
  deselectTransformClip,
  updateInlineCaptionText,
  handlePlayingIntent,
  handleSeekIntent,
  commitSelectedTransform,
  commitSelectedTransforms,
  commitSelectedCrop,
  previewSelectedRotation,
  commitSelectedRotation,
  commitZoom,
  isCropping,
  isGridVisible,
  timelineZoomLevel,
  isSnappingEnabled,
  editorCanvasRef,
  isCapturingScreenshot,
  takeCanvasScreenshot,
  canvasFullscreen,
  finishCrop,
  toggleCrop,
  startCrop,
  selectCanvasPreset,
} = workspace;
const { editorData } = toRefs(workspace.props);
const { liveHtmlPreview } = player;
const captureCompositionPreview = computed(() => {
  const preview = liveHtmlPreview.value;
  if (!preview) return undefined;
  return async () => {
    const time = Math.min(preview.html.durationMs, sourceTimeAt(preview.clip, currentTime.value * 1000) ?? 0);
    const bytes = await capture.renderHtmlFrame(preview.html, time);
    return { bytes: new Uint8Array(bytes).buffer, width: preview.html.width, height: preview.html.height };
  };
});
</script>
<template>
  <div class="canvas-column">
    <CanvasToolbar
      :preset="outputCanvas.preset"
      :loading="!initialPlaybackSettled"
      :can-crop="Boolean(selectedTransformClip && isVisualClip(selectedTransformClip))"
      :is-cropping="isCropping"
      :is-grid-visible="isGridVisible"
      :is-capturing-screenshot="isCapturingScreenshot"
      :zoom-percent="editorCanvasRef?.viewportZoom.zoomPercent.value ?? 100"
      :is-zoomed-or-panned="editorCanvasRef?.viewportZoom.isZoomedOrPanned.value ?? false"
      @select:preset="selectCanvasPreset"
      @toggle:crop="toggleCrop"
      @toggle:grid="isGridVisible = !isGridVisible"
      @take:screenshot="takeCanvasScreenshot"
      @zoom:in="editorCanvasRef?.viewportZoom.zoomIn()"
      @zoom:out="editorCanvasRef?.viewportZoom.zoomOut()"
      @reset:zoom="editorCanvasRef?.viewportZoom.resetZoom()"
    />
    <div
      :ref="workspace.canvasPreviewStageRef"
      class="canvas-preview-stage"
      :class="{
        'is-app-fullscreen': canvasFullscreen.isFullscreen.value,
        'is-fullscreen-exiting': canvasFullscreen.isExiting.value,
      }"
    >
      <div v-if="canvasFullscreen.isFullscreen.value" class="fullscreen-preview-back">
        <Button
          variant="frosted"
          size="sm"
          :icon="ArrowLeft"
          :tooltip="tTimelineToolbar('exitFullscreenPreview')"
          @click="canvasFullscreen.toggleFullscreen"
        >
          {{ tTopbarHud('back') }}
        </Button>
      </div>
      <EditorCanvas
        ref="editorCanvasRef"
        :is-playing="isPlaying"
        :current-time="currentTime"
        :duration="duration"
        :cursor-selection="cursorPreview ?? cursorSelection"
        :cursor-pack="cursorPack"
        :cursor-size="cursorSize"
        :cursor-color="cursorColor"
        :enable-shadow="enableShadow"
        :shadow-blur="shadowBlur"
        :shadow-color="shadowColor"
        :shadow-direction="shadowDirection"
        :click-effects="clickEffects"
        :motion="cursorMotion"
        :auto-hide="cursorAutoHide"
        :selected-background="renderedBackground"
        :background-blur-percent="backgroundBlurPercent"
        :frame-for="player.frameFor"
        :frame-version="frameVersion"
        :capture-composition-preview="captureCompositionPreview"
        :dom-preview-active="Boolean(liveHtmlPreview)"
        :preview-quality="previewQuality"
        :playback-state="playbackState"
        :playback-error="playbackError"
        :editor-data="editorData"
        :zoom-elements="timelineZoomPreview ?? zoomElements"
        :zoom-motion-blur="zoomMotionBlur"
        :zoom-auto-follow="zoomAutoFollow"
        :selected-zoom="editLocked ? null : selectedZoom"
        :composition="canvasComposition"
        :output-canvas="renderedOutputCanvas"
        :active-tab="activeTab"
        :selected-transform-clip="selectedTransformClip"
        :selected-clip-ids="selectedClipIds"
        :transform-handles-muted="transformHandlesMuted"
        :is-cropping="isCropping"
        :is-grid-visible="isGridVisible"
        :history-action="historyAction"
        @update:zoom="commitZoom"
        @select:clip="selectEditorClip"
        @select:clips="
          selectEditorTrack({
            clipIds: $event.ids,
            primaryClipId: $event.primaryId,
            additive: $event.additive,
          })
        "
        @select:canvas="selectEditorCanvas"
        @select:cursor="selectEditorCursor"
        @update:cursor-size="cursorSize = $event"
        @deselect:transform-clip="deselectTransformClip"
        @update:clip-transform="commitSelectedTransform"
        @update:clip-transforms="commitSelectedTransforms"
        @update:clip-crop="commitSelectedCrop"
        @preview:clip-crop="previewCrop"
        @preview:clip-rotation="previewSelectedRotation"
        @update:clip-rotation="commitSelectedRotation"
        @request:crop="startCrop"
        @update:caption-text="updateInlineCaptionText"
        @caption-editing-start="beginInlineCaptionEditing"
        @caption-editing-end="endInlineCaptionEditing"
        @done:crop="finishCrop"
        @deselect:zoom="selectedZoomId = null"
      >
        <template #composition-preview="{ bounds }">
          <HtmlDomPreview
            v-if="liveHtmlPreview"
            :preview="liveHtmlPreview"
            :clock="player.htmlClock"
            :bounds="bounds"
            :document-ready="authoring.ready.value"
            :document-error="authoring.error.value"
          />
        </template>
      </EditorCanvas>
      <TimelineToolbar
        :current-time="currentTime"
        :duration="timelineDisplayDuration"
        :is-playing="isPlaying"
        :loading="!initialPlaybackSettled || isVoiceoverOpen"
        :can-split="!editLocked && selectedClipIds.length === 1"
        :can-undo="canUndo"
        :can-redo="canRedo"
        :is-canvas-fullscreen="canvasFullscreen.isFullscreen.value"
        v-model:zoom-level="timelineZoomLevel"
        v-model:is-snapping-enabled="isSnappingEnabled"
        v-model:preview-quality="previewQuality"
        :performance-snapshot="performanceSnapshot"
        @update:is-playing="handlePlayingIntent"
        @update:current-time="handleSeekIntent"
        @split="splitSelectedClip"
        @undo="undo"
        @redo="redo"
        @toggle:canvas-fullscreen="canvasFullscreen.toggleFullscreen"
      />
    </div>
  </div>
</template>
<style scoped>
.canvas-column {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  position: relative;
}
.canvas-preview-stage {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.canvas-preview-stage.is-app-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 10000;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 12px;
  box-sizing: border-box;
  background: var(--color-bg-surface);
  transform-origin: center;
  animation: canvas-fullscreen-in 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
.canvas-preview-stage.is-app-fullscreen.is-fullscreen-exiting {
  pointer-events: none;
  animation: canvas-fullscreen-out 160ms cubic-bezier(0.7, 0, 0.84, 0) forwards;
}
.fullscreen-preview-back {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 100;
}
:global(body.beam-app-fullscreen-active) {
  overflow: hidden;
}
@keyframes canvas-fullscreen-in {
  from {
    opacity: 0;
    transform: scale(0.975);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes canvas-fullscreen-out {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.975);
  }
}
@media (prefers-reduced-motion: reduce) {
  .canvas-preview-stage.is-app-fullscreen,
  .canvas-preview-stage.is-app-fullscreen.is-fullscreen-exiting {
    animation-duration: 1ms;
  }
}
</style>
