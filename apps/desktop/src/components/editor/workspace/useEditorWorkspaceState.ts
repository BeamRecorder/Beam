import { useCropPreview } from '../composables/useCropPreview';
import { computed, provide, ref, toRef } from 'vue';
import { lockedTimelineSelection } from '@beam/engine/composition/timeline-locks';
import { useVideoEditor } from '~/components/editor/composables/useVideoEditor';
import { useTranslate } from '~/i18n/useTranslate';
import { useExportJob } from '~/components/export/useExportJob';
import { type OutputCanvasSettings } from '@beam/engine/layout/output-canvas';
import {
  isBlurClip,
  isColorClip,
  isShapeClip,
  isCaptionClip,
  isVisualClip,
} from '@beam/engine/shared/composition-types';
import {
  DEFAULT_ZOOM_DURATION_MS,
  DEFAULT_ZOOM_AUTO_FOLLOW,
  DEFAULT_ZOOM_MOTION_BLUR,
  type ZoomElement,
} from '@beam/engine/zoom/zoom-types';
import type { CursorSelection } from '@beam/engine/capture/cursor-pack';
import { usePreviewPerformanceMonitor } from '../performance/usePreviewPerformanceMonitor';
import { createMediaProcessingCollector, MEDIA_PROCESSING_COLLECTOR } from '../performance/media-processing-pressure';
import { useToastStore } from '~/ui/toast/toastStore';
import type { EditorWorkspaceProps, EditorWorkspaceEmit } from './workspace-types';
export function useEditorWorkspaceState(props: EditorWorkspaceProps, emit: EditorWorkspaceEmit) {
  const { t } = useTranslate('VideoEditor');
  const { t: tTopbarHud } = useTranslate('TopbarHUD');
  const { t: tTimelineTracks } = useTranslate('TimelineTracks');
  const { t: tTimelineToolbar } = useTranslate('TimelineToolbar');
  const toast = useToastStore();
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
    editorPresets,
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
    addVisualElementAtTime,
    updateCaption,
    trimClipEdge,
    moveClipTo,
    splitSelectedClip,
    holdClip,
    reorderVisualClip,
    reorderCaptionClip,
    updateSelectedAppearance,
    updateSelectedTransform,
    updateSelectedTransforms,
    updateSelectedBlur,
    updateSelectedCrop,
    updateSelectedCameraLayout,
    updateSelectedCameraFraming,
    updateSelectedCameraSplitRatio,
    updateSelectedCameraSplitPadding,
    updateSelectedWebcamReactToZoom,
    updateSelectedMirrored,
    updateSelectedMirroredY,
    updateSelectedRotation,
    updateSelectedRate,
    updateSelectedVolume,
    updateSelectedEnabled,
    toggleClip,
  } = compositionState;
  const {
    zoomElements,
    selectedZoomId,
    selectedZoomIds,
    selectedZoom,
    canGenerateZooms,
    hasAutomaticZooms,
    selectZooms,
    addZoomAtTime,
    generateZooms,
    updateZoom,
    trimZoomEdge,
    moveZoom,
  } = zoomState;
  const zoomMotionBlur = zoomState.zoomMotionBlur ?? ref({ ...DEFAULT_ZOOM_MOTION_BLUR });
  const zoomAutoFollow = zoomState.zoomAutoFollow ?? ref({ ...DEFAULT_ZOOM_AUTO_FOLLOW });
  const newZoomDurationMs = computed(() => editorDefaults.value.zoom?.durationMs ?? DEFAULT_ZOOM_DURATION_MS);
  const { isExporting, progress: exportProgress } = useExportJob();
  const timelineCompositionPreview = ref<typeof composition.value | null>(null);
  const timelineZoomPreview = ref<ZoomElement[] | null>(null);
  const timelinePreviewDuration = computed(() => {
    const previewDurationMs = timelineCompositionPreview.value?.clips.reduce(
      (maximum, clip) => Math.max(maximum, clip.timelineStartMs + clip.timelineDurationMs),
      0,
    );
    return (
      Math.max(
        previewDurationMs ?? duration.value * 1_000,
        ...(timelineZoomPreview.value ?? zoomElements.value).map((zoom) => zoom.endMs),
      ) / 1_000
    );
  });
  const timelineCanvasPreview = ref<OutputCanvasSettings | null>(null);
  const captionCompositionPreview = ref<typeof composition.value | null>(null);
  const layerCompositionPreview = ref<typeof composition.value | null>(null);
  const cursorPreview = ref<CursorSelection | null>(null);
  const transformHandlesMuted = ref(false);
  const isInlineCaptionEditing = ref(false);
  const { cropPreview, cropCompositionPreview, previewCrop } = useCropPreview({
    composition,
    selectedClipIds,
  });
  const canvasComposition = computed(
    () =>
      cropCompositionPreview.value ??
      captionCompositionPreview.value ??
      layerCompositionPreview.value ??
      timelineCompositionPreview.value ??
      composition.value,
  );
  const renderedOutputCanvas = computed(() => timelineCanvasPreview.value ?? outputCanvas.value);
  const lockedSelection = computed(() =>
    lockedTimelineSelection(composition.value, zoomElements.value, {
      clipIds: selectedClipIds.value,
      zoomIds: selectedZoomIds.value,
    }),
  );
  const editLocked = computed(
    () => lockedSelection.value.clipIds.length > 0 || lockedSelection.value.zoomIds.length > 0,
  );
  const selectedTransformClip = computed(() => {
    if (editLocked.value) return null;
    if (selectedClipIds.value.length !== 1) return null;
    const clip =
      cropCompositionPreview.value?.clips.find((item) => item.id === selectedClipId.value) ??
      layerCompositionPreview.value?.clips.find((item) => item.id === selectedClipId.value) ??
      selectedClip.value;
    return clip &&
      (isVisualClip(clip) || isColorClip(clip) || isShapeClip(clip) || isBlurClip(clip) || isCaptionClip(clip))
      ? clip
      : null;
  });

  return {
    t,
    tTopbarHud,
    tTimelineTracks,
    tTimelineToolbar,
    toast,
    mediaProcessing,
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
    editorPresets,
    outputCanvas,
    handleSelectTab,
    initialPlaybackSettled,
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
    performanceSnapshot,
    cursorSelection,
    cursorPacks,
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
    addVisualElementAtTime,
    updateCaption,
    trimClipEdge,
    moveClipTo,
    splitSelectedClip,
    holdClip,
    reorderVisualClip,
    reorderCaptionClip,
    updateSelectedAppearance,
    updateSelectedTransform,
    updateSelectedTransforms,
    updateSelectedBlur,
    updateSelectedCrop,
    updateSelectedCameraLayout,
    updateSelectedCameraFraming,
    updateSelectedCameraSplitRatio,
    updateSelectedCameraSplitPadding,
    updateSelectedWebcamReactToZoom,
    updateSelectedMirrored,
    updateSelectedMirroredY,
    updateSelectedRotation,
    updateSelectedRate,
    updateSelectedVolume,
    updateSelectedEnabled,
    toggleClip,
    zoomElements,
    selectedZoomId,
    selectedZoomIds,
    selectedZoom,
    canGenerateZooms,
    hasAutomaticZooms,
    selectZooms,
    addZoomAtTime,
    generateZooms,
    updateZoom,
    trimZoomEdge,
    moveZoom,
    zoomMotionBlur,
    zoomAutoFollow,
    newZoomDurationMs,
    isExporting,
    exportProgress,
    timelineCompositionPreview,
    timelineZoomPreview,
    timelinePreviewDuration,
    timelineCanvasPreview,
    captionCompositionPreview,
    layerCompositionPreview,
    cursorPreview,
    transformHandlesMuted,
    isInlineCaptionEditing,
    cropPreview,
    cropCompositionPreview,
    previewCrop,
    canvasComposition,
    renderedOutputCanvas,
    lockedSelection,
    editLocked,
    selectedTransformClip,
    props,
    emit,
  };
}
