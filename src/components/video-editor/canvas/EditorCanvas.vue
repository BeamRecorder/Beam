<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef, toRaw, watch } from 'vue';
import { RotateCcw } from '@lucide/vue';
import Button from '../../ui/button/Button.vue';
import CanvasLoadingSkeleton from './CanvasLoadingSkeleton.vue';
import UndoRedoToast from './UndoRedoToast.vue';
import type { VisualClip } from '~/media/shared/composition-types';
import { createCompositionSceneLayerResolver, type CompositionSceneLayers } from '../composition/scene-layers';
import { OUTPUT_FALLBACK_COLOR, OUTPUT_PREVIEW_RADIUS, outputPreviewRect } from './output-canvas';
import { useCanvasBackground } from './composables/useCanvasBackground';
import { useCompositionMedia } from './composables/useCompositionMedia';
import { createCanvasFrameScheduler } from './composables/canvas-frame-scheduler';
import { useCursorOverlay } from './composables/useCursorOverlay';
import { useCameraZoom, type RenderedVideoWindow, type VideoWindowBounds } from './composables/useCameraZoom';
import { useLayerTransformAndCrop } from './composables/useLayerTransformAndCrop';
import { useViewportZoom } from './composables/useViewportZoom';
import { useTranslate } from '~/i18n/useTranslate';
import { canvasGuideLines } from './canvas-guides';
import { transformCaptionFollowsCursor, type EditorCanvasEmits, type EditorCanvasProps } from './editor-canvas-types';
import { DEFAULT_ZOOM_MOTION_BLUR } from '../zoom/zoom-types';
import { PerspectivePreviewRenderer } from '../zoom/perspective-preview-renderer';
import { drawBeamWatermark } from './watermark-render';
import { useCanvasTransitionRenderer } from './composables/useCanvasTransitionRenderer';
import { measureCanvasCaptionText } from './canvas-text-measure';
import { useCanvasLoadingState } from './composables/useCanvasLoadingState';
import { useCanvasClipToggleTransition } from './composables/useCanvasClipToggleTransition';
import { previewRenderScale } from '~/media/playback';
import CursorCanvasSelection from './CursorCanvasSelection.vue';
import { useCursorCanvasInteraction } from './composables/useCursorCanvasInteraction';
import { CURSOR_SIZE_MAX, CURSOR_SIZE_MIN } from '../properties/cursor/cursor-size';
import { useEditorCanvasPointerInteractions } from './composables/useEditorCanvasPointerInteractions';
import { useEditorCanvasAssets } from './composables/useEditorCanvasAssets';
import { useEditorCanvasInvalidation } from './composables/useEditorCanvasInvalidation';
import { CaptionInlineEditor, useCaptionInlineEditing } from './caption-inline-editing';
import CanvasLayerSelection from './CanvasLayerSelection.vue';
import CanvasCropSelection from './CanvasCropSelection.vue';
import { drawFallbackPreviewScene } from './fallback-preview-scene';
import { createEditorVisualStackRenderer } from './editor-visual-stack-renderer';
const { t } = useTranslate('EditorCanvas');
const props = withDefaults(defineProps<EditorCanvasProps>(), { previewQuality: 'full' });
const emit = defineEmits<EditorCanvasEmits>();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const logicalSize = ref({ width: 0, height: 0 });
const deviceScale = ref(1);
const perspectivePreviewRenderer = new PerspectivePreviewRenderer();
const canvasTransitionRenderer = useCanvasTransitionRenderer({
  outputCanvas: () => props.outputCanvas,
  currentTime: () => props.currentTime,
  duration: () => props.duration ?? 0,
  logicalSize: () => logicalSize.value,
  deviceScale: () => deviceScale.value,
  fallbackColor: OUTPUT_FALLBACK_COLOR,
});
const isFormatTransitioning = ref(false);
let formatTransitionTimer: ReturnType<typeof setTimeout> | null = null;
let drawVisualStack:
  | ((
      ctx: CanvasRenderingContext2D,
      videoWindow: RenderedVideoWindow,
      drawScreen: () => void,
      layers: CompositionSceneLayers,
    ) => void)
  | null = null;
const viewportZoom = useViewportZoom();
let renderComposition = toRaw(props.composition);
const sceneLayersAt = shallowRef(createCompositionSceneLayerResolver(renderComposition));
watch(
  () => props.composition,
  (composition) => {
    renderComposition = toRaw(composition);
    sceneLayersAt.value = createCompositionSceneLayerResolver(renderComposition);
  },
  { deep: true, flush: 'sync' },
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
  return { left: `${preview.x}px`, top: `${preview.y}px`, width: `${preview.width}px`, height: `${preview.height}px` };
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
const { drawBackground, syncPlayback, isTransitioningBackground } = useCanvasBackground(
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
  videoWindowBounds: () => cameraZoom.videoWindowBounds.value,
  overlayWindowBounds: () => {
    if (cameraZoom.overlayWindowBounds.value) return cameraZoom.overlayWindowBounds.value;
    const preview = outputPreviewRect(logicalSize.value.width, logicalSize.value.height, props.outputCanvas);
    return { dx: preview.x, dy: preview.y, dw: preview.width, dh: preview.height, scale: 1 };
  },
  isCropping: () => props.isCropping,
  outputCanvas: () => props.outputCanvas,
  measureCaptionText: (text, fontSize, style) => measureCanvasCaptionText(canvasRef.value, text, fontSize, style),
  zoomScale: () => viewportZoom.zoomScale.value,
  onUpdateTransform: (transform) => emit('update:clip-transform', transform),
  onUpdateCrop: (crop) => emit('update:clip-crop', crop),
  onSelectTransformClip: (clipId) => emit('select:clip', clipId),
});
const renderGuideLines = computed(() =>
  canvasGuideLines(logicalSize.value, props.outputCanvas, transformAndCrop.activeGuideLines.value),
);
cameraZoom = useCameraZoom({
  canvasRef: () => canvasRef.value,
  outputCanvas: () => props.outputCanvas,
  zoomElements: () => props.zoomElements,
  zoomMotionBlur: () => props.zoomMotionBlur ?? DEFAULT_ZOOM_MOTION_BLUR,
  selectedZoom: () => props.selectedZoom,
  currentTime: () => props.currentTime,
  isPlaying: () => props.isPlaying,
  editorData: () => props.editorData,
  activeTab: () => props.activeTab,
  composition: () => renderComposition,
  sceneLayersAt: (timeMs) => sceneLayersAt.value(timeMs),
  screenTransformDraft: () =>
    props.selectedTransformClip?.kind === 'screen' ? transformAndCrop.transformDraft.value : null,
  isCropping: () => props.isCropping,
  drawBackground,
  videoError: () => props.playbackError?.message ?? null,
  renderVisualStack: (ctx, window, drawScreen, layers) => drawVisualStack?.(ctx, window, drawScreen, layers),
  onUpdateZoom: (zoom) => emit('update:zoom', zoom),
  onSelectScreenClip: (clipId) => emit('select:clip', clipId),
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
let currentRenderWindow: RenderedVideoWindow | null = null;
const compositionMedia = useCompositionMedia({
  composition: () => props.composition,
  currentTime: () => props.currentTime,
  frameFor: props.frameFor,
  selectedTransformClip: () => props.selectedTransformClip,
  transformDraft: () => transformAndCrop.transformDraft.value,
  isCropping: () => props.isCropping,
  outputCanvas: () => props.outputCanvas,
  captionViewport: () => {
    const preview = outputPreviewRect(logicalSize.value.width, logicalSize.value.height, props.outputCanvas);
    return { x: preview.x, y: preview.y, width: preview.width, height: preview.height };
  },
  keyboardCursorPosition: () =>
    currentRenderWindow
      ? cursorOverlay.cursorPositionForKeyboardCaption(
          currentRenderWindow,
          screenFrame.value?.width ?? 0,
          screenFrame.value?.height ?? 0,
        )
      : null,
  editingCaptionId: () => captionEditing.editingCaptionId.value,
  onRenderOnce: renderOnce,
});
const visualStackRenderer = createEditorVisualStackRenderer(compositionMedia);
const drawNonScreenVisuals = visualStackRenderer.drawNonScreenVisuals;
drawVisualStack = visualStackRenderer.drawVisualStack;
const cursorOverlay = useCursorOverlay({
  cursorSelection: () => props.cursorSelection,
  cursorPack: () => props.cursorPack,
  cursorSize: () => props.cursorSize,
  cursorColor: () => props.cursorColor,
  enableShadow: () => props.enableShadow,
  clickEffects: () => props.clickEffects,
  motion: () => props.motion,
  autoHide: () => props.autoHide,
  shadowBlur: () => props.shadowBlur,
  shadowColor: () => props.shadowColor,
  shadowDirection: () => props.shadowDirection,
  outputCanvas: () => props.outputCanvas,
  deviceScale: () => deviceScale.value,
  currentTime: () => props.currentTime,
  isPlaying: () => props.isPlaying,
  editorData: () => props.editorData,
  screenClip: () => liveScreenClip.value,
  isScreenEnabled: () => Boolean(liveScreenClip.value && screenFrame.value),
  showBackground: () => props.outputCanvas.showBackground,
  onRenderOnce: renderOnce,
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
watch(
  () => `${props.outputCanvas.width}:${props.outputCanvas.height}:${props.outputCanvas.showBackground}`,
  () => {
    isFormatTransitioning.value = true;
    if (formatTransitionTimer) clearTimeout(formatTransitionTimer);
    formatTransitionTimer = setTimeout(() => {
      isFormatTransitioning.value = false;
    }, 260);
    renderOnce();
  },
);
useEditorCanvasInvalidation({
  props,
  transformDraft: () => transformAndCrop.transformDraft.value,
  renderOnce,
  resetCamera: cameraZoom.resetCameraUnlessDragging,
});
const resizeCanvas = () => {
  const canvas = canvasRef.value;
  const container = containerRef.value;
  if (!canvas || !container) return;
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const renderScale = previewRenderScale(width, height, dpr, props.previewQuality);
  deviceScale.value = renderScale;
  logicalSize.value = { width, height };
  canvas.width = Math.max(1, Math.round(width * renderScale));
  canvas.height = Math.max(1, Math.round(height * renderScale));
  renderCanvas();
};
watch(() => props.previewQuality, resizeCanvas);
const watermarkLogo = useEditorCanvasAssets(containerRef, resizeCanvas, renderOnce);
const drawCameraScene = (ctx: CanvasRenderingContext2D): VideoWindowBounds => {
  const layers = currentSceneLayers.value;
  const window = cameraZoom.drawVideoWindow(
    ctx,
    logicalSize.value.width,
    logicalSize.value.height,
    screenFrame.value,
    layers,
  );
  if (window) {
    currentRenderWindow = window;
    if (!compositionMedia.drawVisualStack) compositionMedia.drawWebcamClips(ctx, window);
    cursorOverlay.updateAndDrawRipplesAndCursor(
      ctx,
      window,
      screenFrame.value?.width ?? 1,
      screenFrame.value?.height ?? 1,
      logicalSize.value.width,
      (drawContent) => cameraZoom.drawInCameraSpace(ctx, window, drawContent),
    );
    return window;
  } else {
    currentRenderWindow = null;
    cursorOverlay.clearCursorBounds();
    const preview = outputPreviewRect(logicalSize.value.width, logicalSize.value.height, props.outputCanvas);
    return drawFallbackPreviewScene({
      context: ctx,
      preview,
      radius: OUTPUT_PREVIEW_RADIUS,
      drawBackground: () => drawBackground(ctx, preview),
      drawVisuals: (window) => drawNonScreenVisuals(ctx, window, layers),
    });
  }
};
const drawCanvasScene = (ctx: CanvasRenderingContext2D) => {
  const preview = outputPreviewRect(logicalSize.value.width, logicalSize.value.height, props.outputCanvas);
  const contentWindow = perspectivePreviewRenderer.render({
    target: ctx,
    bounds: preview,
    pixelScale: deviceScale.value,
    timeMs: props.currentTime * 1_000,
    zooms: props.zoomElements,
    drawScene: drawCameraScene,
  });
  compositionMedia.drawComposition(ctx, contentWindow, undefined, currentSceneLayers.value);
  drawBeamWatermark(
    ctx,
    props.outputCanvas,
    { x: preview.x, y: preview.y, width: preview.width, height: preview.height },
    watermarkLogo.value,
  );
};
const renderCanvas = () => {
  const canvas = canvasRef.value;
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx || !logicalSize.value.width || !logicalSize.value.height) return;
  ctx.setTransform(deviceScale.value, 0, 0, deviceScale.value, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, logicalSize.value.width, logicalSize.value.height);
  canvasTransitionRenderer.render(ctx, drawCanvasScene);
  clipToggleTransition.blendPreviousFrame(ctx, logicalSize.value.width, logicalSize.value.height);
};
const {
  commitCrop,
  handleIslandPointerDown,
  handleIslandPointerDownCapture: handleCanvasPointerDownCapture,
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
  onDoneCrop: () => emit('done:crop'),
});
const handleIslandPointerDownCapture = (event: PointerEvent) => {
  if ((event.target as Element | null)?.closest('.caption-text-editor')) return;
  handleCanvasPointerDownCapture(event);
};
onUnmounted(() => {
  frameScheduler.dispose();
  perspectivePreviewRenderer.dispose();
  if (formatTransitionTimer) clearTimeout(formatTransitionTimer);
});
defineExpose({ viewportZoom });
</script>
<template>
  <div
    class="canvas-island"
    ref="containerRef"
    :class="{
      'is-grabbing': viewportZoom.isPanning.value,
      'is-space-pressed': viewportZoom.isSpacePressed.value,
      'is-selection-editable': selectedZoom?.mode === 'manual',
    }"
    @wheel="handleIslandWheel"
    @pointerdown.capture="handleIslandPointerDownCapture"
    @pointerdown="handleIslandPointerDown"
    @pointermove="handleIslandPointerMove"
    @pointerup="handleIslandPointerUp"
    @pointercancel="handleIslandPointerUp"
    @dblclick="captionEditing.begin"
  >
    <Transition name="fade-slide">
      <div v-if="viewportZoom.isOutOfBounds.value" class="canvas-recenter-float">
        <Button
          variant="frosted"
          size="xs"
          :icon="RotateCcw"
          class="recenter-button"
          @click.stop="viewportZoom.resetZoom"
        >
          {{ t('recenter') }}
        </Button>
      </div>
    </Transition>
    <div class="canvas-viewport" :style="viewportZoom.viewportStyle.value">
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
      <div v-if="isGridVisible" class="canvas-3x3-grid" :style="previewFrameStyle">
        <div class="grid-line vertical line-1" />
        <div class="grid-line vertical line-2" />
        <div class="grid-line horizontal line-1" />
        <div class="grid-line horizontal line-2" />
      </div>
      <div
        v-for="(guide, index) in renderGuideLines"
        :key="index"
        class="canvas-guide-line"
        :class="guide.type"
        :style="guide.style"
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
      <CanvasLayerSelection
        v-if="
          selectedTransformClip &&
          selectedTransformClip.id !== captionEditing.editingCaptionId.value &&
          !transformCaptionFollowsCursor(selectedTransformClip) &&
          !isCropping &&
          selectedZoom?.mode !== 'manual'
        "
        :viewport-style="transformAndCrop.transformSelectionViewportStyle.value"
        :handle-style="transformAndCrop.transformHandleStyle.value"
        :muted="transformHandlesMuted"
        :resize-corners="transformAndCrop.transformResizeCorners.value"
        @pointer-down="handleTransformPointerDown"
        @pointer-move="transformAndCrop.moveTransformDrag"
        @pointer-up="transformAndCrop.endTransformDrag"
        @resize-start="(corner, event) => transformAndCrop.beginTransformDrag(event, 'resize', corner)"
        @resize-move="transformAndCrop.moveTransformDrag"
        @resize-end="transformAndCrop.endTransformDrag"
      />
      <CanvasCropSelection
        v-if="isCropping && selectedTransformClip"
        :container-style="transformAndCrop.cropContainerStyle.value"
        :overlay-style="transformAndCrop.cropOverlayStyle.value"
        @move-start="transformAndCrop.beginCropDrag($event, 'move')"
        @move="transformAndCrop.moveCropDrag"
        @move-end="transformAndCrop.endCropDrag"
        @resize-start="(corner, event) => transformAndCrop.beginCropDrag(event, 'resize', corner)"
        @resize-move="transformAndCrop.moveCropDrag"
        @resize-end="transformAndCrop.endCropDrag"
        @done="commitCrop"
      />
    </div>
    <UndoRedoToast :action="historyAction ?? null" />
  </div>
</template>
<style scoped src="./EditorCanvas.css"></style>
