<script setup lang="ts">
import { customCursorKey } from '../properties/cursor/custom-cursor-context';
import CanvasAddMenu from '../search/CanvasAddMenu.vue';
import { canvasDoubleClick } from './composables/canvas-double-click';
import ElementCanvasOverlay from '../elements/ElementCanvasOverlay.vue';
import { useCanvasElements } from '../elements/useCanvasElements';
import { useCanvasFormatTransition } from './composables/useCanvasFormatTransition';
import { computed, inject, onUnmounted, ref, shallowRef, toRaw, watch } from 'vue';
import CanvasRecenterButton from './CanvasRecenterButton.vue';
import CanvasLoadingSkeleton from './CanvasLoadingSkeleton.vue';
import CanvasPlaybackError from './CanvasPlaybackError.vue';
import UndoRedoToast from './UndoRedoToast.vue';
import { type VisualClip } from '@beam/engine/shared/composition-types';
import { createCompositionSceneLayerResolver } from '@beam/engine/composition/scene-layers';
import { engineMetrics } from '@beam/runtime/performance/engine-metrics';
import { OUTPUT_PREVIEW_RADIUS, outputPreviewRect } from '@beam/engine/layout/output-canvas';
import { useCanvasBackground } from './composables/useCanvasBackground';
import { useCompositionMedia } from './composables/useCompositionMedia';
import { createCanvasFrameScheduler } from './composables/canvas-frame-scheduler';
import { useEditorCanvasCursor } from './composables/useEditorCanvasCursor';
import { useCameraZoom, type RenderedVideoWindow } from './composables/useCameraZoom';
import { useLayerTransformAndCrop } from './composables/useLayerTransformAndCrop';
import { useViewportZoom } from './composables/useViewportZoom';
import { useTranslate } from '~/i18n/useTranslate';
import { canvasGuideLines } from './canvas-guides';
import { type EditorCanvasEmits, type EditorCanvasProps } from './editor-canvas-types';
import { DEFAULT_ZOOM_AUTO_FOLLOW, DEFAULT_ZOOM_MOTION_BLUR } from '@beam/engine/zoom/zoom-types';
import { measureCanvasCaptionText } from './canvas-text-measure';
import { useCanvasLoadingState } from './composables/useCanvasLoadingState';
import { useCanvasClipToggleTransition } from './composables/useCanvasClipToggleTransition';
import CursorCanvasSelection from './CursorCanvasSelection.vue';
import { useCursorCanvasInteraction } from './composables/useCursorCanvasInteraction';
import { CURSOR_SIZE_MAX, CURSOR_SIZE_MIN } from '@beam/engine/cursor/cursor-size';
import { useEditorCanvasPointerInteractions } from './composables/useEditorCanvasPointerInteractions';
import { resizeEditorCanvas } from './canvas-sizing';
import { useEditorCanvasAssets } from './composables/useEditorCanvasAssets';
import { useEditorCanvasInvalidation } from './composables/useEditorCanvasInvalidation';
import { CaptionInlineEditor, useCaptionInlineEditing } from './caption-inline-editing';
import EditorCanvasLayerSelection from './EditorCanvasLayerSelection.vue';
import CanvasCropSelection from './CanvasCropSelection.vue';
import { disposeMediaShadowCache } from '@beam/runtime/composition/appearance/media-shadow-cache';
import { disposeBlurEffect } from '@beam/runtime/composition/effects/blur-effect';
import { captureCanvasFrame } from './canvas-frame-capture';
import { createRuntimePreview } from './runtime-preview';
import CanvasMarqueeSurface from './CanvasMarqueeSurface.vue';
import GlassHighlightSelection from './GlassHighlightSelection.vue';
import EditorCanvasGuides from './EditorCanvasGuides.vue';
import { toggleCanvasClipSelection } from './canvas-clip-selection';
const { t } = useTranslate('EditorCanvas'),
  { t: canvasText } = useTranslate('CanvasPanel');
const props = withDefaults(defineProps<EditorCanvasProps>(), {
  previewQuality: 'full',
  selectedClipIds: () => [],
});
const emit = defineEmits<EditorCanvasEmits>();
const selectCanvasClip = (clipId: string, event?: PointerEvent) => {
  const selection = toggleCanvasClipSelection(props.selectedClipIds, clipId, event);
  if (selection) emit('select:clips', selection);
  else emit('select:clip', clipId);
};
const canvasRef = ref<HTMLCanvasElement | null>(null);
const glassSelection = ref<InstanceType<typeof GlassHighlightSelection> | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const logicalSize = ref({ width: 0, height: 0 });
const deviceScale = ref(1);
const viewportZoom = useViewportZoom();
let renderComposition = toRaw(props.composition);
const sceneLayersAt = shallowRef(createCompositionSceneLayerResolver(renderComposition));
watch(
  () => props.composition,
  (composition) => {
    renderComposition = toRaw(composition);
    sceneLayersAt.value = createCompositionSceneLayerResolver(renderComposition);
  },
  { flush: 'sync' },
);
const currentSceneLayers = computed(() => sceneLayersAt.value(props.currentTime * 1_000));
const liveScreenClip = computed<VisualClip | null>(() => currentSceneLayers.value.screen);
const screenFrame = computed(() => {
  void props.frameVersion;
  return liveScreenClip.value ? props.frameFor(liveScreenClip.value.id) : null;
});
const { showLoadingSkeleton, isCanvasCovered } = useCanvasLoadingState({
  clip: liveScreenClip,
  frame: screenFrame,
  playbackError: () => props.playbackError,
  playbackState: () => props.playbackState,
});
const previewFrameStyle = computed(() => {
  const preview = outputPreviewRect(logicalSize.value.width, logicalSize.value.height, props.outputCanvas);
  return {
    left: `${preview.x}px`,
    top: `${preview.y}px`,
    width: `${preview.width}px`,
    height: `${preview.height}px`,
  };
});
const outputAspectRatio = computed(() => props.outputCanvas.width / props.outputCanvas.height);
const frameScheduler = createCanvasFrameScheduler(
  () => renderCanvas(),
  () => props.isPlaying || isTransitioningBackground.value,
);
const renderOnce = frameScheduler.requestRender;
const clipToggleTransition = useCanvasClipToggleTransition({
  canvas: () => canvasRef.value,
  composition: () => props.composition,
  onRenderOnce: renderOnce,
});
const { drawBackground, backgroundCacheKey, syncPlayback, isTransitioningBackground } = useCanvasBackground(
  () => props.selectedBackground,
  () => props.backgroundBlurPercent,
  () => props.previewQuality,
  renderOnce,
);
let cameraZoom: ReturnType<typeof useCameraZoom>;
const transformAndCrop = useLayerTransformAndCrop({
  composition: () => props.composition,
  currentTime: () => props.currentTime,
  selectedTransformClip: () => props.selectedTransformClip,
  selectedClipIds: () => props.selectedClipIds,
  videoWindowBounds: () => cameraZoom.videoWindowBounds.value,
  overlayWindowBounds: () => {
    if (cameraZoom.overlayWindowBounds.value) return cameraZoom.overlayWindowBounds.value;
    const preview = outputPreviewRect(logicalSize.value.width, logicalSize.value.height, props.outputCanvas);
    return {
      dx: preview.x,
      dy: preview.y,
      dw: preview.width,
      dh: preview.height,
      scale: 1,
    };
  },
  isCropping: () => props.isCropping,
  outputCanvas: () => props.outputCanvas,
  measureCaptionText: (text, fontSize, style) => measureCanvasCaptionText(canvasRef.value, text, fontSize, style),
  zoomScale: () => viewportZoom.zoomScale.value,
  onUpdateTransform: (transform) => emit('update:clip-transform', transform),
  onUpdateTransforms: (transforms) => emit('update:clip-transforms', transforms),
  onPreviewCrop: (crop) => emit('preview:clip-crop', crop),
  onUpdateCrop: (crop) => emit('update:clip-crop', crop),
  onSelectTransformClip: selectCanvasClip,
});
const renderGuideLines = computed(() =>
  canvasGuideLines(logicalSize.value, props.outputCanvas, transformAndCrop.activeGuideLines.value),
);
cameraZoom = useCameraZoom({
  canvasRef: () => canvasRef.value,
  outputCanvas: () => props.outputCanvas,
  zoomElements: () => props.zoomElements,
  zoomMotionBlur: () => props.zoomMotionBlur ?? DEFAULT_ZOOM_MOTION_BLUR,
  zoomAutoFollow: () => props.zoomAutoFollow ?? DEFAULT_ZOOM_AUTO_FOLLOW,
  selectedZoom: () => props.selectedZoom,
  currentTime: () => props.currentTime,
  isPlaying: () => props.isPlaying,
  editorData: () => props.editorData,
  activeTab: () => props.activeTab,
  composition: () => renderComposition,
  sceneLayersAt: (timeMs) => sceneLayersAt.value(timeMs),
  screenTransformDraft: () => transformAndCrop.transformDraftFor(liveScreenClip.value?.id ?? ''),
  isCropping: () => props.isCropping,
  drawBackground,
  onUpdateZoom: (zoom) => emit('update:zoom', zoom),
  onSelectScreenClip: selectCanvasClip,
  onSelectCanvas: () => emit('select:canvas'),
  onDeselectTransformClip: () => emit('deselect:transform-clip'),
  onDeselectZoom: () => emit('deselect:zoom'),
  selectVisualAt: (event) => transformAndCrop.selectVisualAt(event, canvasRef.value),
  selectedTransformClipExists: () => Boolean(props.selectedTransformClip),
  onRenderOnce: renderOnce,
});
watch(
  () => props.isPlaying,
  (playing) => {
    syncPlayback(playing);
    cameraZoom.resetCamera();
  },
);
const captionEditing = useCaptionInlineEditing({
  composition: () => props.composition,
  selectedClip: () => props.selectedTransformClip,
  isPlaying: () => props.isPlaying,
  isCropping: () => Boolean(props.isCropping),
  isManualZoom: () => props.selectedZoom?.mode === 'manual',
  logicalSize,
  outputCanvas: () => props.outputCanvas,
  selectionViewportStyle: () => transformAndCrop.transformSelectionViewportStyle.value,
  selectionLayoutStyle: () => transformAndCrop.transformHandleStyle.value,
  clipIdAt: (event) => transformAndCrop.clipIdAt(event, canvasRef.value),
  activeCaptionIds: () => currentSceneLayers.value.captions.map((clip) => clip.id),
  onSelect: (clipId) => emit('select:clip', clipId),
  onUpdate: (value) => emit('update:caption-text', value),
  onStart: () => emit('caption-editing-start'),
  onEnd: (cancelled) => emit('caption-editing-end', { cancelled }),
  onRender: renderOnce,
});
const elements = useCanvasElements({
  bounds: () => cameraZoom.overlayWindowBounds.value,
  preview: () => outputPreviewRect(logicalSize.value.width, logicalSize.value.height, props.outputCanvas),
  clipIdAt: (event) => transformAndCrop.clipIdAt(event, canvasRef.value),
  canEdit: () => !props.isPlaying && !props.isCropping && props.selectedZoom?.mode !== 'manual',
  render: renderOnce,
});
let currentRenderWindow: RenderedVideoWindow | null = null;
const compositionMedia = useCompositionMedia({
  composition: () => props.composition,
  currentTime: () => props.currentTime,
  frameFor: props.frameFor,
  selectedTransformClip: () => props.selectedTransformClip,
  transformDraft: () => transformAndCrop.transformDraft.value,
  transformDraftFor: transformAndCrop.transformDraftFor,
  isCropping: () => props.isCropping,
  outputCanvas: () => props.outputCanvas,
  captionViewport: () => {
    const preview = outputPreviewRect(logicalSize.value.width, logicalSize.value.height, props.outputCanvas);
    return {
      x: preview.x,
      y: preview.y,
      width: preview.width,
      height: preview.height,
    };
  },
  keyboardCursorPosition: () =>
    currentRenderWindow
      ? cursorOverlay.cursorPositionForKeyboardCaption(
          currentRenderWindow,
          screenFrame.value?.width ?? 0,
          screenFrame.value?.height ?? 0,
        )
      : null,
  editingCaptionId: () => elements.editingId.value ?? captionEditing.editingCaptionId.value,
  onRenderOnce: renderOnce,
});
const cursorOverlay = useEditorCanvasCursor(props, {
  deviceScale: () => deviceScale.value,
  screenClip: () => liveScreenClip.value,
  hasScreenFrame: () => Boolean(screenFrame.value),
  renderOnce,
});
const cursorInteraction = useCursorCanvasInteraction({
  bounds: cursorOverlay.cursorBounds,
  canvas: () => canvasRef.value,
  cursorSize: () => props.cursorSize,
  isPlaying: () => props.isPlaying,
  canResize: () => props.activeTab === 'cursor' && !props.isPlaying && !props.isCropping,
  onSelect: () => emit('select:cursor'),
  onResize: (size) => emit('update:cursor-size', size),
});
const isFormatTransitioning = useCanvasFormatTransition(() => props.outputCanvas, renderOnce);
useEditorCanvasInvalidation({
  props,
  transformDraft: () => [transformAndCrop.transformDraft.value, transformAndCrop.transformDrafts.value],
  renderOnce,
  resetCamera: cameraZoom.resetCameraUnlessDragging,
});
const resizeCanvas = () => {
  const size = resizeEditorCanvas(canvasRef.value, containerRef.value, props.previewQuality);
  if (!size) return;
  deviceScale.value = size.scale;
  logicalSize.value = { width: size.width, height: size.height };
  renderCanvas();
};
watch(() => props.previewQuality, resizeCanvas);
const watermarkLogo = useEditorCanvasAssets(containerRef, resizeCanvas, renderOnce);
const runtimePreview = createRuntimePreview({
  props,
  zoomDraft: () => glassSelection.value?.draft ?? null,
  images: compositionMedia.images,
  cursorImage: () => cursorOverlay.customCursorImage.value,
  watermarkImage: () => watermarkLogo.value,
  cursorEnabled: () => customCursorEnabled.value,
  drafts: () => {
    const drafts = toRaw(transformAndCrop.transformDrafts.value);
    const single = transformAndCrop.transformDraft.value;
    const id = props.selectedTransformClip?.id;
    return single && id ? { [id]: toRaw(single), ...drafts } : drafts;
  },
  editingCaptionId: () => elements.editingId.value ?? captionEditing.editingCaptionId.value,
  backgroundCacheKey,
  drawBackground,
});
const drawCanvasScene = (ctx: CanvasRenderingContext2D) => {
  const preview = outputPreviewRect(logicalSize.value.width, logicalSize.value.height, props.outputCanvas);
  const layers = currentSceneLayers.value;
  const window = cameraZoom.drawVideoWindow(
    ctx,
    logicalSize.value.width,
    logicalSize.value.height,
    screenFrame.value,
    layers,
    false,
  );
  currentRenderWindow = window;
  if (window)
    cursorOverlay.updateAndDrawRipplesAndCursor(
      ctx,
      window,
      screenFrame.value?.width ?? 1,
      screenFrame.value?.height ?? 1,
      logicalSize.value.width,
      (draw) => cameraZoom.drawInCameraSpace(ctx, window, draw),
      false,
    );
  else cursorOverlay.clearCursorBounds();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(preview.x, preview.y, preview.width, preview.height, OUTPUT_PREVIEW_RADIUS);
  ctx.clip();
  runtimePreview.draw(ctx, preview, screenFrame.value, layers);
  ctx.restore();
};
const renderCanvas = () => {
  const canvas = canvasRef.value;
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx || !logicalSize.value.width || !logicalSize.value.height) return;
  const endMeasurement = engineMetrics.begin('render');
  try {
    ctx.setTransform(deviceScale.value, 0, 0, deviceScale.value, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, logicalSize.value.width, logicalSize.value.height);
    drawCanvasScene(ctx);
    clipToggleTransition.blendPreviousFrame(ctx, logicalSize.value.width, logicalSize.value.height);
    engineMetrics.count('frames');
  } finally {
    endMeasurement();
  }
};
const {
  commitCrop,
  handleIslandPointerDown,
  handleIslandPointerDownCapture,
  handleIslandPointerMove,
  handleIslandPointerUp,
  handleIslandWheel,
  handleTransformPointerDown,
} = useEditorCanvasPointerInteractions({
  canvas: () => canvasRef.value,
  container: () => containerRef.value,
  isCropping: () => Boolean(props.isCropping),
  isManualZoom: () => props.selectedZoom?.mode === 'manual',
  selectedClipId: () => props.selectedTransformClip?.id ?? null,
  viewportZoom,
  cameraZoom,
  transformAndCrop,
  cursorInteraction,
  onSelectClip: (clipId) => emit('select:clip', clipId),
  onToggleClip: selectCanvasClip,
  onDoneCrop: () => emit('done:crop'),
});
const customCursorEnabled = inject(customCursorKey, ref(true));
watch(customCursorEnabled, () => renderOnce());
const addMenu = ref<InstanceType<typeof CanvasAddMenu> | null>(null);
const editCanvasContent = (event: MouseEvent) =>
  canvasDoubleClick(event, {
    beginElement: elements.begin,
    beginCaption: captionEditing.begin,
    blocked: () => props.isPlaying || Boolean(props.isCropping) || props.selectedZoom?.mode === 'manual',
    clipIdAt: (event) => transformAndCrop.clipIdAt(event, canvasRef.value, true),
    composition: () => props.composition,
    crop: (id) => emit('request:crop', id),
    add: (event) => {
      void addMenu.value?.open(event);
    },
  });
onUnmounted(() => frameScheduler.dispose());
onUnmounted(() => runtimePreview.dispose());
onUnmounted(() => {
  const context = canvasRef.value?.getContext('2d') ?? null;
  disposeMediaShadowCache(context);
  disposeBlurEffect(context);
});
const captureCurrentFrame = () => {
  renderCanvas();
  return captureCanvasFrame(canvasRef.value, logicalSize.value, props.outputCanvas);
};
defineExpose({ viewportZoom, captureCurrentFrame });
</script>
<template>
  <div
    class="canvas-island"
    ref="containerRef"
    :class="{
      'is-grabbing': viewportZoom.isPanning.value,
      'is-space-pressed': viewportZoom.isSpacePressed.value,
      'is-selection-editable': !playbackError && selectedZoom?.mode === 'manual',
    }"
    @wheel="handleIslandWheel"
    @pointerdown.capture="handleIslandPointerDownCapture"
    @pointerdown="handleIslandPointerDown"
    @pointermove="handleIslandPointerMove"
    @pointerup="handleIslandPointerUp"
    @pointercancel="handleIslandPointerUp"
    @dblclick="editCanvasContent"
  >
    <CanvasAddMenu ref="addMenu" />
    <Transition name="fade-slide">
      <div v-if="viewportZoom.isOutOfBounds.value" class="canvas-recenter-float" @pointerdown.stop>
        <CanvasRecenterButton @click="viewportZoom.resetZoom" />
      </div>
    </Transition>
    <CanvasMarqueeSurface
      class="canvas-viewport"
      :style="viewportZoom.viewportStyle.value"
      :targets="() => transformAndCrop.marqueeTargets.value"
      :selection="selectedClipIds"
      :show-selection-outlines="!isPlaying"
      :disabled="isPlaying || isCropping || selectedZoom?.mode === 'manual'"
      @select="emit('select:clips', $event)"
    >
      <div class="preview-frame" :style="{ '--preview-aspect-ratio': outputAspectRatio }">
        <div
          class="zoom-selection-box"
          :class="{ locked: selectedZoom?.mode !== 'manual' }"
          :style="cameraZoom.focusTargetStyle.value"
          aria-hidden="true"
        />
      </div>
      <canvas
        ref="canvasRef"
        class="editor-canvas"
        :class="{
          'is-selection-editable': selectedZoom?.mode === 'manual',
          'is-format-transitioning': isFormatTransitioning,
          'is-loading-covered': isCanvasCovered,
        }"
      ></canvas>
      <EditorCanvasGuides :grid-visible="isGridVisible" :grid-style="previewFrameStyle" :guides="renderGuideLines" />
      <GlassHighlightSelection
        v-if="selectedZoom?.effect === 'glass' && selectedZoom.glass && !isPlaying && !isCropping"
        ref="glassSelection"
        :zoom="selectedZoom"
        :canvas-size="outputCanvas"
        :viewport-style="previewFrameStyle"
        :panning="viewportZoom.isSpacePressed.value || viewportZoom.isPanning.value"
        @preview="renderOnce"
        @update="emit('update:zoom', $event)"
      />
      <CanvasLoadingSkeleton
        :visible="showLoadingSkeleton"
        :label="t('videoPreviewLoading')"
        :aspect-ratio="outputCanvas.width / outputCanvas.height"
        @reveal="isCanvasCovered = false"
      />
      <CursorCanvasSelection
        v-if="activeTab === 'cursor' && !isPlaying && !isCropping && cursorOverlay.cursorBounds.value"
        :bounds="cursorOverlay.cursorBounds.value"
        :resizing="cursorInteraction.resizing.value"
        :is-at-limit="cursorSize <= CURSOR_SIZE_MIN || cursorSize >= CURSOR_SIZE_MAX"
        @resize-start="cursorInteraction.beginResize"
        @resize-move="cursorInteraction.moveResize"
        @resize-end="cursorInteraction.endResize"
      />
      <CaptionInlineEditor
        v-if="captionEditing.editingCaption.value"
        :clip="captionEditing.editingCaption.value"
        :viewport-style="transformAndCrop.transformSelectionViewportStyle.value"
        :layout-style="transformAndCrop.transformHandleStyle.value"
        :render-scale="captionEditing.renderScale.value"
        :warning-placement="captionEditing.warningPlacement.value"
        @update="captionEditing.update"
        @finish="captionEditing.finish"
        @cancel="captionEditing.cancel"
      />
      <ElementCanvasOverlay
        :viewport="elements.viewport.value"
        :camera="cameraZoom.overlayWindowBounds.value ?? undefined"
        :surface-size="logicalSize"
      />
      <EditorCanvasLayerSelection
        :clip="selectedTransformClip"
        :editing-id="elements.editingId.value ?? captionEditing.editingCaptionId.value"
        :cropping="isCropping"
        :manual-zoom="selectedZoom?.mode === 'manual'"
        :muted="transformHandlesMuted"
        :interaction="transformAndCrop"
        :rotate-label="canvasText('shapeRotation')"
        @pointer-down="handleTransformPointerDown"
        @rotate="emit('preview:clip-rotation', $event)"
        @rotate-end="emit('update:clip-rotation', $event)"
      />
      <CanvasCropSelection
        v-if="isCropping && selectedTransformClip"
        :container-style="transformAndCrop.cropContainerStyle.value"
        :overlay-style="transformAndCrop.cropOverlayStyle.value"
        :measurements="transformAndCrop.cropMeasurements.value"
        @move-start="transformAndCrop.beginCropDrag($event, 'move')"
        @move="transformAndCrop.moveCropDrag"
        @move-end="transformAndCrop.endCropDrag"
        @resize-start="(corner, event) => transformAndCrop.beginCropDrag(event, 'resize', corner)"
        @resize-move="transformAndCrop.moveCropDrag"
        @resize-end="transformAndCrop.endCropDrag"
        @done="commitCrop"
      />
    </CanvasMarqueeSurface>
    <CanvasPlaybackError v-if="playbackError" :error="playbackError" :style="previewFrameStyle" />
    <UndoRedoToast :action="historyAction ?? null" />
  </div>
</template>
<style scoped src="./EditorCanvas.css"></style>
<style scoped src="../layout/editor-preview-layout.css"></style>
