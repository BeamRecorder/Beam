<script setup lang="ts">
import EditorTimeline from '~/components/video-editor/timeline/EditorTimeline.vue';
import VoiceoverRecorderBar from '~/components/video-editor/voiceover/VoiceoverRecorderBar.vue';
import { useEditorWorkspaceContext } from './workspace-context';
import { toRefs } from 'vue';
const workspace = useEditorWorkspaceContext();
const {
  includeAudioInExport,
  outputCanvas,
  isPlaying,
  currentTime,
  composition,
  selectedClipId,
  selectedClipIds,
  addCaptionAtTime,
  trimClipEdge,
  moveClipTo,
  holdClip,
  reorderVisualClip,
  reorderCaptionClip,
  toggleClip,
  zoomElements,
  selectedZoomId,
  selectedZoomIds,
  addZoomAtTime,
  trimZoomEdge,
  moveZoom,
  newZoomDurationMs,
  exportProgress,
  timelineCompositionPreview,
  timelineZoomPreview,
  timelineCanvasPreview,
  audioNormalization,
  discardVoiceover,
  isVoiceoverOpen,
  pauseVoiceover,
  resumeVoiceover,
  selectVoiceoverMicrophone,
  startVoiceover,
  voiceoverState,
  stopVoiceover,
  toggleVoiceoverMonitoring,
  updateVoiceoverCountdown,
  timelineBaseDuration,
  selectAllTimelineItems,
  selectTimelineBox,
  selectEditorClip,
  selectEditorTrack,
  selectEditorZoom,
  selectEditorZoomTrack,
  openCanvasTransition,
  handleTimelineItemSelection,
  requestClipDeletion,
  addTimelineElement,
  addTimelineVisualElement,
  handlePlayingIntent,
  handleSeekIntent,
  recentPaste,
  reportTimelineCopySuccess,
  reportTimelinePasteError,
  pasteTimelineItem,
  lockTimelineSelection,
  closeTimelineGap,
  moveTimelineSelection,
  deleteTimelineSelection,
  deleteTimelineZoom,
  timelineZoomLevel,
  isSnappingEnabled,
  finishCrop,
  timelineHeight,
} = workspace;
const { project } = toRefs(workspace.props);
</script>
<template>
  <div class="workspace-lower" :style="{ height: `${timelineHeight}px` }">
    <div v-if="isVoiceoverOpen" class="voiceover-recorder-float">
      <VoiceoverRecorderBar
        :state="voiceoverState"
        @start="startVoiceover"
        @pause="pauseVoiceover"
        @resume="resumeVoiceover"
        @stop="stopVoiceover"
        @discard="discardVoiceover"
        @select-microphone="selectVoiceoverMicrophone"
        @update-countdown="updateVoiceoverCountdown"
        @toggle-monitoring="toggleVoiceoverMonitoring"
      />
    </div>
    <EditorTimeline
      :current-time="currentTime"
      :is-playing="isPlaying"
      v-model:zoom-level="timelineZoomLevel"
      :is-snapping-enabled="isSnappingEnabled"
      :project-id="project?.id"
      :duration="timelineBaseDuration"
      :export-progress="exportProgress"
      :include-audio-in-export="includeAudioInExport"
      :zoom-elements="zoomElements"
      :new-zoom-duration-ms="newZoomDurationMs"
      :selected-zoom-id="selectedZoomId"
      :selected-zoom-ids="selectedZoomIds"
      :composition="composition"
      :selected-clip-id="selectedClipId"
      :selected-clip-ids="selectedClipIds"
      :recent-paste="recentPaste"
      :canvas="outputCanvas"
      :controls-locked="isVoiceoverOpen"
      :voiceover-draft="voiceoverState.draft"
      @add:element="addTimelineElement"
      @select:zoom="selectEditorZoom"
      @select:zoom-track="selectEditorZoomTrack"
      @select:clip="selectEditorClip"
      @select:track="selectEditorTrack"
      @select:item="handleTimelineItemSelection"
      @lock:selection="lockTimelineSelection"
      @remove:gap="closeTimelineGap"
      @select:box="
        finishCrop();
        selectTimelineBox($event);
      "
      @select:all="
        finishCrop();
        selectAllTimelineItems();
      "
      @toggle:clip="toggleClip"
      @delete:clips="requestClipDeletion"
      @delete:zoom="deleteTimelineZoom"
      @delete:selection="deleteTimelineSelection"
      @hold:clip="holdClip($event.id, $event.timeMs)"
      @trim:clip="trimClipEdge($event.id, $event.edge, $event.timeMs)"
      @move:clip="moveClipTo($event.id, $event.startMs)"
      @preview:composition="timelineCompositionPreview = $event"
      @preview:zooms="timelineZoomPreview = $event"
      @trim:zoom="trimZoomEdge($event.id, $event.edge, $event.timeMs)"
      @move:zoom="moveZoom($event.id, $event.startMs, $event.endMs)"
      @move:selection="moveTimelineSelection"
      @add:zoom="
        finishCrop();
        addZoomAtTime($event);
      "
      @add:caption="
        finishCrop();
        addCaptionAtTime($event);
      "
      @add:visual-element="addTimelineVisualElement"
      @reorder:clip="reorderVisualClip($event.id, $event.targetIndex)"
      @reorder:caption="reorderCaptionClip($event.id, $event.targetIndex)"
      @paste:item="pasteTimelineItem"
      @paste:error="reportTimelinePasteError"
      @clipboard:copied="reportTimelineCopySuccess"
      @preview:canvas="timelineCanvasPreview = $event"
      @update:canvas="
        outputCanvas = $event;
        timelineCanvasPreview = null;
      "
      @open:canvas-transition="openCanvasTransition"
      @normalize:audio="audioNormalization.normalizeClipIds($event)"
      @update:current-time="handleSeekIntent($event, 'scrub')"
      @update:is-playing="handlePlayingIntent"
    />
  </div>
</template>
<style scoped>
.workspace-lower {
  position: relative;
  flex-shrink: 0;
  border-radius: var(--radius-lg);
  overflow: visible;
  display: flex;
  flex-direction: column;
}
.voiceover-recorder-float {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 12px);
  z-index: 80;
  transform: translateX(-50%);
}
</style>
