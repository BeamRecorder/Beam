<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, toRef, watch } from 'vue';
import type { CaptureProject, ProjectEditorData } from '~/api/types/capture-api';
import SidebarPanel from '~/components/video-editor/sidebar/SidebarPanel.vue';
import PropertiesPanel from '~/components/video-editor/properties/PropertiesPanel.vue';
import EditorCanvas from '~/components/video-editor/canvas/EditorCanvas.vue';
import type {
  CaptionInlineEditingEnd,
  CaptionInlineTextUpdate,
} from '~/components/video-editor/canvas/caption-inline-editing';
import CanvasToolbar from '~/components/video-editor/canvas/CanvasToolbar.vue';
import EditorTimeline from '~/components/video-editor/timeline/EditorTimeline.vue';
import TimelineToolbar from '~/components/video-editor/timeline/TimelineToolbar.vue';
import Topbar from '~/components/video-editor/Topbar.vue';
import EditorAmbientBackground from '~/components/video-editor/EditorAmbientBackground.vue';
import EditorMediaDropOverlay from '~/components/video-editor/EditorMediaDropOverlay.vue';
import LinkedClipsDeleteDialog from '~/components/video-editor/LinkedClipsDeleteDialog.vue';
import { useVideoEditor } from '~/components/video-editor/composables/useVideoEditor';
import { useEditorMediaDrop } from '~/components/video-editor/composables/useEditorMediaDrop';
import { usePlaybackErrorToast } from '~/components/video-editor/composables/usePlaybackErrorToast';
import { useEditorUndoRedo, type EditorStateSnapshot } from '~/components/video-editor/composables/useEditorUndoRedo';
import { useTimelineResize } from '~/components/video-editor/composables/useTimelineResize';
import { useTimelineZoom } from '~/components/video-editor/timeline/composables/useTimelineZoom';
import { useLinkedClipDeletion } from '~/components/video-editor/composables/useLinkedClipDeletion';
import { Sparkles } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useExportJob } from '~/components/export/useExportJob';
import {
  OUTPUT_CANVAS_PRESETS,
  type OutputCanvasPreset,
  type OutputCanvasSettings,
} from '~/components/video-editor/canvas/output-canvas';
import {
  isAudioClip,
  isBlurClip,
  isColorClip,
  isShapeClip,
  isCaptionClip,
  isTextCaptionClip,
  isVisualClip,
  type NormalizedCrop,
  type NormalizedTransform,
} from '~/media/shared/composition-types';
import {
  DEFAULT_ZOOM_DURATION_MS,
  DEFAULT_ZOOM_MOTION_BLUR,
  type ZoomElement,
} from '~/components/video-editor/zoom/zoom-types';
import type { CursorSelection } from '~/api/types/cursor-pack';
import { pasteClipAt } from '~/components/video-editor/composition/engine/clip-paste';
import type { TimelinePasteRequest } from '~/components/video-editor/timeline/composables/timeline-clipboard-types';
import { useTimelineClipboardFeedback } from '~/components/video-editor/timeline/composables/useTimelineClipboardFeedback';
import { EMPTY_CLIP_TRANSITIONS } from '~/media/shared/clip-transitions';
import { usePreviewPerformanceMonitor } from './performance/usePreviewPerformanceMonitor';
import { createMediaProcessingCollector, MEDIA_PROCESSING_COLLECTOR } from './performance/media-processing-pressure';

const { t } = useTranslate('VideoEditor');
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
  (event: 'start-recording', config: any): void;
}>();
const mediaProcessing = createMediaProcessingCollector();
provide(MEDIA_PROCESSING_COLLECTOR, mediaProcessing);

const {
  activeTab,
  systemVolume,
  micVolume,
  player,
  cursor,
  cursorMotion,
  compositionState,
  editorState,
  zoomState,
  exportRequest,
  includeAudioInExport,
  editorDefaults,
  outputCanvas,
  handleSelectTab,
  initialPlaybackSettled,
} = useVideoEditor({
  project: toRef(props, 'project'),
  editorData: toRef(props, 'editorData'),
});
const {
  isPlaying,
  currentTime,
  duration,
  volume,
  playbackState,
  playbackError,
  frameVersion,
  previewQuality,
  playbackMetrics,
  audioMetrics,
  selectedBackground,
  selectedBackgroundMedia,
  backgroundBlurPercent,
  backgroundGroups,
  addBackground,
} = player;
const { snapshot: performanceSnapshot } = usePreviewPerformanceMonitor({
  isPlaying,
  playbackState,
  previewQuality,
  playbackMetrics,
  audioMetrics,
  mediaMetrics: mediaProcessing.metrics,
  isReady: initialPlaybackSettled,
});
const {
  selection: cursorSelection,
  packs: cursorPacks,
  selectedPack: cursorPack,
  cursorSize,
  cursorColor,
  enableShadow,
  shadowBlur,
  shadowColor,
  shadowDirection,
  clickEffects,
  autoHide: cursorAutoHide,
} = cursor;
const renderedBackground = computed(() => (outputCanvas.value.showBackground ? selectedBackgroundMedia.value : null));
const {
  composition,
  selectedClipId,
  selectedClipIds,
  selectedClip,
  selectedClipInfo,
  selectedCaptionClip,
  isSystemAudioEnabled,
  isMicAudioEnabled,
  hasSystemAudio,
  hasMicAudio,
  selectClip,
  selectClips,
  addElement,
  addImportedAsset,
  addCaptionAtTime,
  updateCaption,
  trimClipEdge,
  moveClipTo,
  splitSelectedClip,
  holdClip,
  reorderVisualClip,
  reorderCaptionClip,
  updateSelectedAppearance,
  updateSelectedTransform,
  updateSelectedBlur,
  updateSelectedCrop,
  updateSelectedCameraLayout,
  updateSelectedCameraFraming,
  updateSelectedCameraSplitRatio,
  updateSelectedCameraSplitPadding,
  updateSelectedWebcamReactToZoom,
  updateSelectedMirrored,
  updateSelectedMirroredY,
  updateSelectedRate,
  updateSelectedVolume,
  updateSelectedEnabled,
  toggleClip,
  detachSelectedClip,
} = compositionState;
const { isDeleteDialogOpen, linkedDeleteClips, requestClipDeletion, deleteFromDialog, closeDeleteDialog } =
  useLinkedClipDeletion({ composition, selectedClipId, selectedClipIds });
const mediaDrop = useEditorMediaDrop({
  projectId: () => props.project?.id ?? null,
  currentTimeSeconds: () => currentTime.value,
  addImportedAsset,
  t,
});
usePlaybackErrorToast(playbackError, t, () => ({
  project: props.project ?? null,
  editorData: props.editorData ?? null,
  composition: composition.value,
}));
const {
  zoomElements,
  selectedZoomId,
  selectedZoom,
  canGenerateZooms,
  hasAutomaticZooms,
  addZoomAtTime,
  generateZooms,
  updateZoom,
  trimZoomEdge,
  moveZoom,
  pasteZoomAtTime,
  deleteSelectedZoom,
  deleteZoomById,
} = zoomState;
const zoomMotionBlur = zoomState.zoomMotionBlur ?? ref({ ...DEFAULT_ZOOM_MOTION_BLUR });
const newZoomDurationMs = computed(() => editorDefaults.value.zoom?.durationMs ?? DEFAULT_ZOOM_DURATION_MS);
const { isExporting, progress: exportProgress } = useExportJob();
const timelineCompositionPreview = ref<typeof composition.value | null>(null);
const timelinePreviewDuration = computed(() => {
  const previewDurationMs = timelineCompositionPreview.value?.clips.reduce(
    (maximum, clip) => Math.max(maximum, clip.timelineStartMs + clip.timelineDurationMs),
    0,
  );
  return previewDurationMs === undefined ? duration.value : previewDurationMs / 1_000;
});
const timelineCanvasPreview = ref<OutputCanvasSettings | null>(null);
const captionCompositionPreview = ref<typeof composition.value | null>(null);
const cursorPreview = ref<CursorSelection | null>(null);
const transformHandlesMuted = ref(false);
const isInlineCaptionEditing = ref(false);
const canvasComposition = computed(
  () => captionCompositionPreview.value ?? timelineCompositionPreview.value ?? composition.value,
);
const renderedOutputCanvas = computed(() => timelineCanvasPreview.value ?? outputCanvas.value);
const selectedTransformClip = computed(() => {
  if (selectedClipIds.value.length !== 1) return null;
  const clip = selectedClip.value;
  return clip &&
    (isVisualClip(clip) || isColorClip(clip) || isShapeClip(clip) || isBlurClip(clip) || isCaptionClip(clip))
    ? clip
    : null;
});

const addTimelineElement = (kind: 'video' | 'image' | 'sound' | 'caption' | 'color' | 'shape' | 'blur') => {
  void addElement(kind).catch(() => console.error('Unable to add media.'));
};
const selectEditorClip = (clipId: string) => {
  selectedZoomId.value = null;
  selectClip(clipId);
  activeTab.value = 'clip';
};
const selectEditorTrack = (selection: { clipIds: string[]; primaryClipId: string | null; additive?: boolean }) => {
  selectedZoomId.value = null;
  isCropping.value = false;
  selectClips(
    selection.additive ? [...selectedClipIds.value, ...selection.clipIds] : selection.clipIds,
    selection.primaryClipId,
  );
};
const selectEditorZoom = (zoomId: string) => {
  selectedClipId.value = null;
  selectedZoomId.value = zoomId;
  activeTab.value = 'zoom';
};
const selectEditorCanvas = () => {
  selectedClipId.value = null;
  activeTab.value = 'canvas';
  isCropping.value = false;
};
const selectEditorCursor = () => {
  selectedClipId.value = null;
  selectedZoomId.value = null;
  isCropping.value = false;
  activeTab.value = 'cursor';
};
const propertiesPanelRef = ref<InstanceType<typeof PropertiesPanel> | null>(null);
const openCanvasTransition = (edge: 'entry' | 'exit') => {
  selectEditorCanvas();
  void nextTick(() => propertiesPanelRef.value?.openCanvasTransitions(edge));
};
const deselectTransformClip = () => {
  selectedClipId.value = null;
  isCropping.value = false;
};
const replaceComposition = (value: typeof composition.value) => {
  captionCompositionPreview.value = null;
  composition.value = value;
  editorState.scheduleSave();
};
const previewComposition = (value: typeof composition.value | null) => {
  captionCompositionPreview.value = value;
};
watch([() => selectedCaptionClip.value?.id, activeTab], () => {
  captionCompositionPreview.value = null;
  cursorPreview.value = null;
});
const commitCaption = (clip: Parameters<typeof updateCaption>[0]) => {
  captionCompositionPreview.value = null;
  updateCaption(clip);
};
const updateInlineCaptionText = ({ clipId, customText }: CaptionInlineTextUpdate) => {
  const clip = composition.value.clips.find((candidate) => candidate.id === clipId);
  if (!clip || !isTextCaptionClip(clip)) return;
  if (selectedClipId.value !== clipId || selectedClipIds.value.length !== 1) selectEditorClip(clipId);
  commitCaption({
    ...clip,
    caption: {
      ...clip.caption,
      style: { ...clip.caption.style, customText },
    },
  });
};
const deleteAudioRole = (role: 'system' | 'microphone') => {
  requestClipDeletion(
    composition.value.clips.filter((clip) => isAudioClip(clip) && clip.role === role).map((clip) => clip.id),
  );
};
const handlePlayingIntent = (playing: boolean) => {
  void player.setPlaying(playing).catch(() => console.error('Unable to change playback state.'));
};
const handleSeekIntent = (time: number, mode: 'seek' | 'scrub' = 'seek') => {
  void player.seek(time, mode).catch(() => console.error('Unable to seek media.'));
};

// Editor state only contains JSON data. Serializing first unwraps Vue proxies, so
// history snapshots stay cloneable after any reactive edit.
const cloneSerializable = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const createEditorSnapshot = (): EditorStateSnapshot => ({
  composition: cloneSerializable(composition.value),
  zoomElements: cloneSerializable(zoomElements.value),
  zoomMotionBlur: cloneSerializable(zoomMotionBlur.value),
  outputCanvas: cloneSerializable(outputCanvas.value),
  selectedBackground: selectedBackground.value ? cloneSerializable(selectedBackground.value) : null,
  backgroundBlurPercent: backgroundBlurPercent.value,
});
const {
  recordSnapshot,
  commitNow,
  undo,
  redo,
  canUndo,
  canRedo,
  lastAction: historyAction,
} = useEditorUndoRedo({
  onRestoreSnapshot: async (snapshot) => {
    composition.value = snapshot.composition;
    zoomElements.value = snapshot.zoomElements;
    if (snapshot.zoomMotionBlur) zoomMotionBlur.value = snapshot.zoomMotionBlur;
    outputCanvas.value = snapshot.outputCanvas;
    selectedBackground.value = snapshot.selectedBackground;
    backgroundBlurPercent.value = snapshot.backgroundBlurPercent;
    await editorState.saveNow();
  },
});
const beginInlineCaptionEditing = () => {
  if (isInlineCaptionEditing.value) return;
  isInlineCaptionEditing.value = true;
  commitNow(createEditorSnapshot());
};
const endInlineCaptionEditing = ({ cancelled }: CaptionInlineEditingEnd) => {
  if (!isInlineCaptionEditing.value) return;
  isInlineCaptionEditing.value = false;
  if (!cancelled) commitNow(createEditorSnapshot());
};

const {
  recentPaste,
  reportCopySuccess: reportTimelineCopySuccess,
  reportPasteError: reportTimelinePasteError,
  reportPasteSuccess: reportTimelinePasteSuccess,
} = useTimelineClipboardFeedback();
const pasteTimelineItem = (request: TimelinePasteRequest) => {
  try {
    const projectId = props.project?.id;
    if (!projectId || request.item.scopeId !== projectId) throw new Error(t('timelineClipboardDifferentProject'));
    const timelineDurationMs = Math.round(duration.value * 1_000);
    let pastedId: string;
    if (request.item.type === 'zoom') {
      const pasted = pasteZoomAtTime(request.item.zoom, request.timeMs);
      selectedClipId.value = null;
      pastedId = pasted.id;
    } else {
      const targetTrackId =
        request.target?.category === 'visual' && (isVisualClip(request.item.clip) || isBlurClip(request.item.clip))
          ? request.target.trackId
          : null;
      const pasted = pasteClipAt(composition.value, request.item.clip, {
        timelineStartMs: request.timeMs,
        timelineDurationMs,
        targetTrackId,
        asset: request.item.asset,
      });
      composition.value = pasted.composition;
      selectEditorClip(pasted.clipId);
      editorState.scheduleSave();
      pastedId = pasted.clipId;
    }
    commitNow(createEditorSnapshot());
    reportTimelinePasteSuccess(pastedId, request.item);
  } catch (error) {
    reportTimelinePasteError(error instanceof Error ? error.message : String(error));
  }
};

const commitSelectedTransform = (transform: NormalizedTransform) => {
  updateSelectedTransform(transform);
  commitNow(createEditorSnapshot());
};

const commitSelectedCrop = (crop: NormalizedCrop) => {
  updateSelectedCrop(crop);
  commitNow(createEditorSnapshot());
};

const commitZoom = (zoom: ZoomElement) => {
  updateZoom(zoom);
  commitNow(createEditorSnapshot());
};

let historyInitialized = false;
let editorReadyTimer: ReturnType<typeof setTimeout> | null = null;
let editorReadyFallbackTimer: ReturnType<typeof setTimeout> | null = null;
let editorReadyEmitted = false;
let stopInitialPlaybackWatch: (() => void) | null = null;

const emitEditorReady = () => {
  if (editorReadyEmitted) return;
  editorReadyEmitted = true;
  if (editorReadyFallbackTimer) {
    clearTimeout(editorReadyFallbackTimer);
    editorReadyFallbackTimer = null;
  }
  stopInitialPlaybackWatch?.();
  stopInitialPlaybackWatch = null;
  // requestAnimationFrame is paused while the native window is hidden. A
  // short timer lets the parent reveal it without waiting for a frame that
  // cannot run in a hidden Electron window.
  editorReadyTimer = setTimeout(() => {
    editorReadyTimer = null;
    emit('ready');
  }, 0);
};
watch(
  editorState.loading,
  (loading) => {
    if (loading || historyInitialized) return;
    historyInitialized = true;
    recordSnapshot(createEditorSnapshot());
  },
  { immediate: true },
);
watch(
  composition,
  () => {
    if (historyInitialized && !editorState.loading.value && !isInlineCaptionEditing.value)
      recordSnapshot(createEditorSnapshot, 300);
  },
  { deep: true },
);
watch(
  [zoomElements, zoomMotionBlur, outputCanvas, selectedBackground, backgroundBlurPercent],
  () => {
    if (historyInitialized && !editorState.loading.value) recordSnapshot(createEditorSnapshot, 300);
  },
  { deep: true },
);

onMounted(() => {
  stopInitialPlaybackWatch = watch(
    initialPlaybackSettled,
    (settled) => {
      if (!settled) return;
      emitEditorReady();
    },
    { immediate: true },
  );
  editorReadyFallbackTimer = setTimeout(() => {
    console.warn('[Beam media:editor] Initial playback did not settle before the editor ready timeout.');
    emitEditorReady();
  }, 5_000);
});

const isCropping = ref(false);
const isGridVisible = ref(false);
const { timelineZoomLevel } = useTimelineZoom();
const isSnappingEnabled = ref(true);
const editorCanvasRef = ref<InstanceType<typeof EditorCanvas> | null>(null);
const toggleCrop = () => {
  if (selectedTransformClip.value && isVisualClip(selectedTransformClip.value)) isCropping.value = !isCropping.value;
};
const selectCanvasPreset = (preset: Exclude<OutputCanvasPreset, 'custom'>) => {
  outputCanvas.value = {
    ...OUTPUT_CANVAS_PRESETS[preset],
    showBackground: outputCanvas.value.showBackground,
    transitions: outputCanvas.value.transitions ?? EMPTY_CLIP_TRANSITIONS,
    watermark: outputCanvas.value.watermark,
  };
};
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.defaultPrevented || isDeleteDialogOpen.value) return;
  if (event.key === 'Escape') {
    if (isCropping.value) isCropping.value = false;
    else if (selectedZoomId.value) selectedZoomId.value = null;
    else if (selectedClipId.value) selectedClipId.value = null;
  }
  const active = document.activeElement;
  if (active) {
    const tag = active.tagName.toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || active.getAttribute('contenteditable') === 'true') return;
  }
  if ((event.key === 's' || event.key === 'S') && selectedClipId.value) {
    event.preventDefault();
    splitSelectedClip();
    return;
  }
  if (event.key !== 'Delete' && event.key !== 'Backspace') return;
  if (selectedClipId.value) {
    event.preventDefault();
    requestClipDeletion(selectedClipIds.value.length ? selectedClipIds.value : [selectedClipId.value]);
  } else if (selectedZoom.value && activeTab.value === 'zoom') {
    event.preventDefault();
    deleteSelectedZoom();
  }
};

const { timelineHeight, isResizingTimeline, startTimelineResize } = useTimelineResize();

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown);
  if (editorReadyTimer) clearTimeout(editorReadyTimer);
  if (editorReadyFallbackTimer) clearTimeout(editorReadyFallbackTimer);
  stopInitialPlaybackWatch?.();
});
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
      @back-to-hud="emit('back-to-hud')"
      @open-project="emit('open-project', $event)"
      @undo="undo"
      @redo="redo"
      @update:export-audio="includeAudioInExport = $event"
    />
    <div v-if="isExporting" class="export-notice-banner">
      <Sparkles :size="14" class="banner-icon" /><span>{{ t('exportBanner') }}</span>
    </div>
    <div class="editor-workspace">
      <div class="workspace-upper">
        <SidebarPanel :active-tab="activeTab" @select-tab="handleSelectTab" />
        <PropertiesPanel
          ref="propertiesPanelRef"
          :active-tab="activeTab"
          :selected-clip="selectedClipInfo"
          :selected-caption-clip="selectedCaptionClip"
          :selected-clip-ids="selectedClipIds"
          v-model:cursor-selection="cursorSelection"
          :cursor-packs="cursorPacks"
          @preview:cursor-selection="cursorPreview = $event"
          v-model:cursor-size="cursorSize"
          v-model:cursor-color="cursorColor"
          v-model:enable-shadow="enableShadow"
          v-model:shadow-blur="shadowBlur"
          v-model:shadow-color="shadowColor"
          v-model:shadow-direction="shadowDirection"
          v-model:click-effects="clickEffects"
          v-model:motion="cursorMotion"
          v-model:auto-hide="cursorAutoHide"
          v-model:volume="volume"
          v-model:system-volume="systemVolume"
          v-model:mic-volume="micVolume"
          v-model:is-system-audio-enabled="isSystemAudioEnabled"
          v-model:is-mic-audio-enabled="isMicAudioEnabled"
          :has-system-audio="hasSystemAudio"
          :has-mic-audio="hasMicAudio"
          :selected-background="selectedBackground"
          :blur-percent="backgroundBlurPercent"
          :background-groups="backgroundGroups"
          :selected-zoom="selectedZoom"
          :can-generate-zooms="canGenerateZooms"
          :has-automatic-zooms="hasAutomaticZooms"
          :zoom-motion-blur="zoomMotionBlur"
          :composition="composition"
          :editor-data="editorData"
          :timeline-duration-ms="Math.round(duration * 1000)"
          :project-id="project?.id"
          :canvas="renderedOutputCanvas"
          @import:background="addBackground($event)"
          @update:selected-background="selectedBackground = $event"
          @update:blur-percent="backgroundBlurPercent = $event"
          @update:canvas="outputCanvas = $event"
          @update:zoom="updateZoom"
          @update:zoom-motion-blur="zoomState.updateZoomMotionBlur"
          @delete:zoom="deleteSelectedZoom"
          @generate:zooms="generateZooms()"
          @update:caption="commitCaption"
          @update:composition="replaceComposition"
          @preview:composition="previewComposition"
          @select-caption="selectEditorClip"
          @delete-clip="
            requestClipDeletion(selectedClipIds.length ? selectedClipIds : selectedClipId ? [selectedClipId] : [])
          "
          @delete:system-audio="deleteAudioRole('system')"
          @delete:mic-audio="deleteAudioRole('microphone')"
          @split-clip="splitSelectedClip"
          @update:clip-rate="updateSelectedRate"
          @update:clip-volume="updateSelectedVolume"
          @update:blur="updateSelectedBlur"
          @update:clip-enabled="updateSelectedEnabled"
          @unlink-clip="detachSelectedClip"
          @update:clip-is-mirrored="updateSelectedMirrored"
          @update:clip-is-mirrored-y="updateSelectedMirroredY"
          @update:clip-corner-radius="
            updateSelectedAppearance({
              cornerRadius: ['none', 'sm', 'md', 'lg', 'full'].includes($event)
                ? ($event as 'none' | 'sm' | 'md' | 'lg' | 'full')
                : Number($event),
            })
          "
          @corner-radius-interaction="transformHandlesMuted = $event"
          @update:clip-shadow="
            updateSelectedAppearance({
              shadowSize: $event.size as 'none' | 'sm' | 'md' | 'lg' | 'custom',
              shadowBlur: Number($event.blur ?? 40),
              shadowMode: ($event.mode ?? 'solid') as 'solid' | 'adaptive',
              shadowColor: $event.color ?? '#000000',
              shadowDirection: ($event.direction ?? 'bottom') as 'all' | 'bottom' | 'bottom-right' | 'top-left',
            })
          "
          @update:clip-appearance="updateSelectedAppearance($event)"
          @update:clip-transform="commitSelectedTransform"
          @update:camera-layout="updateSelectedCameraLayout"
          @update:camera-framing="updateSelectedCameraFraming"
          @update:camera-split-ratio="updateSelectedCameraSplitRatio"
          @update:camera-split-padding="updateSelectedCameraSplitPadding"
          @update:webcam-react-to-zoom="updateSelectedWebcamReactToZoom"
          @reset:clip-transform="commitSelectedTransform({ x: 0, y: 0, width: 1, height: 1 })"
          @back-to-hud="emit('back-to-hud')"
          @start-recording="emit('start-recording', $event)"
        />

        <div class="canvas-column">
          <CanvasToolbar
            :preset="outputCanvas.preset"
            :loading="!initialPlaybackSettled"
            :can-crop="Boolean(selectedTransformClip && isVisualClip(selectedTransformClip))"
            :is-cropping="isCropping"
            :is-grid-visible="isGridVisible"
            :zoom-percent="editorCanvasRef?.viewportZoom.zoomPercent.value ?? 100"
            :is-zoomed-or-panned="editorCanvasRef?.viewportZoom.isZoomedOrPanned.value ?? false"
            @select:preset="selectCanvasPreset"
            @toggle:crop="toggleCrop"
            @toggle:grid="isGridVisible = !isGridVisible"
            @zoom:in="editorCanvasRef?.viewportZoom.zoomIn()"
            @zoom:out="editorCanvasRef?.viewportZoom.zoomOut()"
            @reset:zoom="editorCanvasRef?.viewportZoom.resetZoom()"
          />
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
            :preview-quality="previewQuality"
            :playback-state="playbackState"
            :playback-error="playbackError"
            :editor-data="editorData"
            :zoom-elements="zoomElements"
            :zoom-motion-blur="zoomMotionBlur"
            :selected-zoom="selectedZoom"
            :composition="canvasComposition"
            :output-canvas="renderedOutputCanvas"
            :active-tab="activeTab"
            :selected-transform-clip="selectedTransformClip"
            :transform-handles-muted="transformHandlesMuted"
            :is-cropping="isCropping"
            :is-grid-visible="isGridVisible"
            :history-action="historyAction"
            @update:zoom="commitZoom"
            @select:clip="selectEditorClip"
            @select:canvas="selectEditorCanvas"
            @select:cursor="selectEditorCursor"
            @update:cursor-size="cursorSize = $event"
            @deselect:transform-clip="deselectTransformClip"
            @update:clip-transform="commitSelectedTransform"
            @update:clip-crop="commitSelectedCrop"
            @update:caption-text="updateInlineCaptionText"
            @caption-editing-start="beginInlineCaptionEditing"
            @caption-editing-end="endInlineCaptionEditing"
            @done:crop="isCropping = false"
            @deselect:zoom="selectedZoomId = null"
          />
          <TimelineToolbar
            :current-time="currentTime"
            :duration="timelinePreviewDuration"
            :is-playing="isPlaying"
            :loading="!initialPlaybackSettled"
            :can-split="selectedClipIds.length === 1"
            v-model:zoom-level="timelineZoomLevel"
            v-model:is-snapping-enabled="isSnappingEnabled"
            v-model:preview-quality="previewQuality"
            :performance-snapshot="performanceSnapshot"
            @update:is-playing="handlePlayingIntent"
            @update:current-time="handleSeekIntent"
            @add:element="addTimelineElement"
            @split="splitSelectedClip"
          />
        </div>
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
      <div class="workspace-lower" :style="{ height: `${timelineHeight}px` }">
        <EditorTimeline
          :current-time="currentTime"
          :is-playing="isPlaying"
          v-model:zoom-level="timelineZoomLevel"
          :is-snapping-enabled="isSnappingEnabled"
          :project-id="project?.id"
          :duration="duration"
          :export-progress="exportProgress"
          :include-audio-in-export="includeAudioInExport"
          :zoom-elements="zoomElements"
          :new-zoom-duration-ms="newZoomDurationMs"
          :selected-zoom-id="selectedZoomId"
          :composition="composition"
          :selected-clip-id="selectedClipId"
          :selected-clip-ids="selectedClipIds"
          :recent-paste="recentPaste"
          :canvas="outputCanvas"
          @select:zoom="selectEditorZoom"
          @select:clip="selectEditorClip"
          @select:track="selectEditorTrack"
          @toggle:clip="toggleClip"
          @delete:clips="requestClipDeletion"
          @delete:zoom="deleteZoomById"
          @hold:clip="holdClip($event.id, $event.timeMs)"
          @trim:clip="trimClipEdge($event.id, $event.edge, $event.timeMs)"
          @move:clip="moveClipTo($event.id, $event.startMs)"
          @preview:composition="timelineCompositionPreview = $event"
          @trim:zoom="trimZoomEdge($event.id, $event.edge, $event.timeMs)"
          @move:zoom="moveZoom($event.id, $event.startMs, $event.endMs)"
          @add:zoom="addZoomAtTime"
          @add:caption="addCaptionAtTime"
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
          @update:current-time="handleSeekIntent($event, 'scrub')"
          @update:is-playing="handlePlayingIntent"
        />
      </div>
    </div>
    <LinkedClipsDeleteDialog
      :is-open="isDeleteDialogOpen"
      :clips="linkedDeleteClips"
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
.workspace-lower {
  flex-shrink: 0;
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
