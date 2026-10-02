import { ref, shallowRef, watch } from 'vue';
import { useCanvasScreenshot } from '~/components/editor/composables/useCanvasScreenshot';
import { useTimelineZoom } from '~/components/editor/timeline/composables/useTimelineZoom';
import { OUTPUT_CANVAS_PRESETS, type OutputCanvasPreset } from '@beam/engine/layout/output-canvas';
import {
  isShapeClip,
  isVisualClip,
  type NormalizedCrop,
  type NormalizedTransform,
} from '@beam/engine/shared/composition-types';
import { type ZoomElement } from '@beam/engine/zoom/zoom-types';
import { EMPTY_CLIP_TRANSITIONS } from '@beam/engine/shared/clip-transitions';
import { useElementFullscreen } from '../canvas/composables/useElementFullscreen';
import { setShapeLayerStyle } from '@beam/engine/commands/clip-engine';
import type { EditorWorkspaceState, EditorWorkspaceHistory, EditorCanvasHandle } from './workspace-types';
export function useEditorWorkspaceCanvas(
  state: EditorWorkspaceState,
  history: EditorWorkspaceHistory,
  selectEditorClip: (clipId: string) => void,
) {
  const {
    editorState,
    outputCanvas,
    composition,
    selectedClipId,
    selectedClipIds,
    updateSelectedTransform,
    updateSelectedTransforms,
    updateSelectedCrop,
    updateZoom,
    shapeCompositionPreview,
    cropPreview,
    previewCrop,
    selectedTransformClip,
    props,
  } = state;
  const { createEditorSnapshot, commitNow } = history;
  const commitSelectedTransform = (transform: NormalizedTransform) => {
    updateSelectedTransform(transform);
    commitNow(createEditorSnapshot());
  };
  const commitSelectedTransforms = (transforms: Parameters<typeof updateSelectedTransforms>[0]) => {
    updateSelectedTransforms(transforms);
    commitNow(createEditorSnapshot());
  };

  const commitSelectedCrop = (crop: NormalizedCrop) => {
    commitNow(createEditorSnapshot());
    updateSelectedCrop(crop);
    previewCrop(null);
    commitNow(createEditorSnapshot());
  };
  const previewSelectedShapeRotation = (rotation: number | null) => {
    const clip = selectedTransformClip.value;
    shapeCompositionPreview.value =
      rotation === null || !clip || !isShapeClip(clip)
        ? null
        : setShapeLayerStyle(composition.value, clip.id, { rotation });
  };
  const commitSelectedShapeRotation = (rotation: number) => {
    const clip = selectedTransformClip.value;
    if (!clip || !isShapeClip(clip)) return;
    shapeCompositionPreview.value = null;
    composition.value = setShapeLayerStyle(composition.value, clip.id, {
      rotation,
    });
    commitNow(createEditorSnapshot());
    editorState.scheduleSave();
  };

  const commitZoom = (zoom: ZoomElement) => {
    updateZoom(zoom);
    commitNow(createEditorSnapshot());
  };
  const isCropping = ref(false);
  const isGridVisible = ref(false);
  const { timelineZoomLevel } = useTimelineZoom();
  const isSnappingEnabled = ref(true);
  const editorCanvasRef = shallowRef<EditorCanvasHandle | null>(null);
  const { isCapturingScreenshot, takeCanvasScreenshot } = useCanvasScreenshot({
    source: editorCanvasRef,
    project: () => props.project,
  });
  const canvasPreviewStageRef = ref<HTMLElement | null>(null);
  const canvasFullscreen = useElementFullscreen(() => canvasPreviewStageRef.value);
  const finishCrop = () => {
    if (isCropping.value && cropPreview.value) commitSelectedCrop(cropPreview.value);
    isCropping.value = false;
  };
  watch(
    [selectedClipId, () => selectedClipIds.value.join('\0')],
    () => {
      isCropping.value = false;
      shapeCompositionPreview.value = null;
    },
    { flush: 'sync' },
  );
  const toggleCrop = () => {
    if (isCropping.value) finishCrop();
    else if (selectedTransformClip.value && isVisualClip(selectedTransformClip.value)) isCropping.value = true;
  };
  const startCrop = (clipId: string) => {
    const clip = composition.value.clips.find((candidate) => candidate.id === clipId);
    if (!clip || !isVisualClip(clip) || clip.locked) return;
    selectEditorClip(clipId);
    isCropping.value = true;
  };
  const selectCanvasPreset = (preset: Exclude<OutputCanvasPreset, 'custom'>) => {
    outputCanvas.value = {
      ...OUTPUT_CANVAS_PRESETS[preset],
      showBackground: outputCanvas.value.showBackground,
      transitions: outputCanvas.value.transitions ?? EMPTY_CLIP_TRANSITIONS,
      watermark: outputCanvas.value.watermark,
    };
  };
  return {
    commitSelectedTransform,
    commitSelectedTransforms,
    commitSelectedCrop,
    previewSelectedShapeRotation,
    commitSelectedShapeRotation,
    commitZoom,
    isCropping,
    isGridVisible,
    timelineZoomLevel,
    isSnappingEnabled,
    editorCanvasRef,
    isCapturingScreenshot,
    takeCanvasScreenshot,
    canvasPreviewStageRef,
    canvasFullscreen,
    finishCrop,
    toggleCrop,
    startCrop,
    selectCanvasPreset,
  };
}
