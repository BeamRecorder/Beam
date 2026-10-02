<script setup lang="ts">
import type { CaptureProject, ProjectEditorData } from '~/api/types/capture-api';
import SidebarPanel from '~/components/video-editor/sidebar/SidebarPanel.vue';
import Topbar from '~/components/video-editor/Topbar.vue';
import EditorAmbientBackground from '~/components/video-editor/EditorAmbientBackground.vue';
import EditorMediaDropOverlay from '~/components/video-editor/EditorMediaDropOverlay.vue';
import LinkedClipsDeleteDialog from '~/components/video-editor/LinkedClipsDeleteDialog.vue';
import { Sparkles } from '@lucide/vue';
import { useEditorWorkspace } from './workspace/useEditorWorkspace';
import { provideEditorWorkspace } from './workspace/workspace-context';
const props = withDefaults(
  defineProps<{
    project?: CaptureProject | null;
    editorData?: ProjectEditorData | null;
  }>(),
  { project: null, editorData: null },
);
const emit = defineEmits<{
  (event: 'ready'): void;
  (event: 'back-to-hud'): void;
  (event: 'open-project', project: CaptureProject): void;
}>();
const workspace = useEditorWorkspace(props, emit);
provideEditorWorkspace(workspace);
const {
  t,
  activeTab,
  editorState,
  exportRequest,
  includeAudioInExport,
  editorPresets,
  currentTime,
  performanceSnapshot,
  renderedBackground,
  composition,
  isExporting,
  undo,
  redo,
  canUndo,
  canRedo,
  isPropertiesPanelOpen,
  selectPropertiesTab,
  isDeleteDialogOpen,
  linkedDeleteClips,
  deleteFromDialog,
  closeDeleteDialog,
  mediaDrop,
  isResizingTimeline,
  startTimelineResize,
} = workspace;
import VideoEditorProperties from './workspace/VideoEditorProperties.vue';
import VideoEditorPreview from './workspace/VideoEditorPreview.vue';
import VideoEditorTracks from './workspace/VideoEditorTracks.vue';
</script>
<template>
  <div
    class="editor-page"
    @dragenter="mediaDrop.onMediaDragEnter"
    @dragover="mediaDrop.onMediaDragOver"
    @dragleave="mediaDrop.onMediaDragLeave"
    @drop="mediaDrop.onMediaDrop"
  >
    <EditorAmbientBackground :background="renderedBackground" />
    <EditorMediaDropOverlay
      :visible="mediaDrop.isDraggingMedia.value || mediaDrop.isImportingMedia.value"
      :importing="mediaDrop.isImportingMedia.value"
      :title="t('mediaDropTitle')"
      :description="t('mediaDropDescription')"
      :importing-label="t('mediaDropImporting')"
    />
    <Topbar
      :export-request="exportRequest"
      :playhead-seconds="currentTime"
      :project="project"
      :is-saving="editorState.isSaving.value"
      :can-undo="canUndo"
      :can-redo="canRedo"
      :performance-snapshot="performanceSnapshot"
      :preset-document="editorPresets.document.value"
      :preset-dirty="editorPresets.dirty.value"
      @back-to-hud="emit('back-to-hud')"
      @open-project="emit('open-project', $event)"
      @undo="undo"
      @redo="redo"
      @preset-select="editorPresets.select"
      @preset-add="editorPresets.create"
      @preset-rename="editorPresets.rename"
      @preset-delete="editorPresets.remove"
      @preset-save="editorPresets.save"
      @update:export-audio="includeAudioInExport = $event"
    />
    <div v-if="isExporting" class="export-notice-banner">
      <Sparkles :size="14" class="banner-icon" /><span>{{ t('exportBanner') }}</span>
    </div>
    <div class="editor-workspace">
      <div class="workspace-upper">
        <SidebarPanel :active-tab="activeTab" :panel-open="isPropertiesPanelOpen" @select-tab="selectPropertiesTab" />
        <VideoEditorProperties />

        <VideoEditorPreview />
      </div>
      <div
        class="timeline-resize-handle"
        role="separator"
        tabindex="0"
        :class="{ 'is-resizing': isResizingTimeline }"
        @pointerdown="startTimelineResize"
      >
        <div class="resize-handle-bar" />
      </div>
      <VideoEditorTracks />
    </div>
    <LinkedClipsDeleteDialog
      :is-open="isDeleteDialogOpen"
      :clips="linkedDeleteClips"
      :assets="composition.assets"
      @delete="deleteFromDialog"
      @close="closeDeleteDialog"
    />
  </div>
</template>
<style scoped>
.export-notice-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--color-primary-light, rgba(255, 90, 31, 0.12));
  border: 1px solid var(--color-primary);
  color: var(--color-primary);
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 600;
  margin: 8px 20px -4px;
  user-select: none;
  z-index: 10;
}
.banner-icon {
  flex-shrink: 0;
}
.editor-page {
  width: 100vw;
  height: 100vh;
  position: relative;
  isolation: isolate;
  background-color: var(--color-bg-surface);
  display: flex;
  flex-direction: column;
  color: var(--text-primary);
  overflow: hidden;
  transition: background-color 0.3s ease;
}
.editor-page > :not(.editor-ambient-background, .media-drop-overlay) {
  position: relative;
}
.editor-workspace {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}
.workspace-upper {
  flex: 1;
  display: flex;
  gap: 12px;
  overflow: hidden;
}
.timeline-resize-handle {
  height: 12px;
  margin-block: -6px;
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 20;
  user-select: none;
  touch-action: none;
}
.resize-handle-bar {
  width: 36px;
  height: 3px;
  border-radius: 9999px;
  background: var(--color-border);
  transition: all 0.15s ease;
}
.timeline-resize-handle:hover .resize-handle-bar,
.timeline-resize-handle.is-resizing .resize-handle-bar {
  width: 56px;
  height: 4px;
  background: var(--color-primary);
  box-shadow: 0 0 8px color-mix(in srgb, var(--color-primary) 50%, transparent);
}
</style>
