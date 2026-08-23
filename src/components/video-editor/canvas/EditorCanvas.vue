<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { Check, RotateCcw } from '@lucide/vue';
import Button from '../../ui/button/Button.vue';
import ResizeHandle from '~/ui/ResizeHandle/ResizeHandle.vue';
import CanvasLoadingSkeleton from './CanvasLoadingSkeleton.vue';
import UndoRedoToast from './UndoRedoToast.vue';
import type { VisualClip } from '~/media/shared/composition-types';
import { resolveCompositionSceneLayers, type CompositionSceneLayers } from '../composition/scene-layers';
import { OUTPUT_FALLBACK_COLOR, OUTPUT_PREVIEW_RADIUS, outputPreviewRect } from './output-canvas';
import { useCanvasBackground } from './composables/useCanvasBackground';
import { useCompositionMedia } from './composables/useCompositionMedia';
import { useCursorOverlay } from './composables/useCursorOverlay';
import { useCameraZoom, type RenderedVideoWindow } from './composables/useCameraZoom';
import { useLayerTransformAndCrop } from './composables/useLayerTransformAndCrop';
import { useViewportZoom } from './composables/useViewportZoom';
import { useTranslate } from '~/i18n/useTranslate';
import { canvasGuideLines } from './canvas-guides';
import type { EditorCanvasEmits, EditorCanvasProps } from './editor-canvas-types';
import { DEFAULT_ZOOM_MOTION_BLUR } from '../zoom/zoom-types';
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
const { t } = useTranslate('EditorCanvas');
const props = withDefaults(defineProps<EditorCanvasProps>(), { previewQuality: 'full' });
const emit = defineEmits<EditorCanvasEmits>();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const logicalSize = ref({ width: 0, height: 0 });
const deviceScale = ref(1);
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
let animationFrameId: number | null = null;
let drawVisualStack:
  | ((
      ctx: CanvasRenderingContext2D,
      videoWindow: RenderedVideoWindow,
      drawScreen: () => void,
      layers: CompositionSceneLayers,
    ) => void)
  | null = null;
const viewportZoom = useViewportZoom();
const liveScreenClip = computed<VisualClip | null>(
  () => resolveCompositionSceneLayers(props.composition, props.currentTime * 1_000).screen,
);
const selectedCaptionFollowsCursor = computed(
  () =>
    props.selectedTransformClip?.kind === 'caption' &&
    props.selectedTransformClip.caption.type === 'keyboard' &&
    props.selectedTransformClip.caption.followCursor,
);
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
function renderOnce() {
  if (animationFrameId === null) animationFrameId = requestAnimationFrame(draw);
}
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
  composition: () => props.composition,
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
  onRenderOnce: renderOnce,
});
const drawNonScreenVisuals = (
  ctx: CanvasRenderingContext2D,
  window: { dx: number; dy: number; dw: number; dh: number; scale: number; focusX: number; focusY: number },
) => {
  if (compositionMedia.drawVisualStack) compositionMedia.drawVisualStack(ctx, window, () => undefined);
  else compositionMedia.drawWebcamClips(ctx, window);
};
drawVisualStack = (ctx, window, drawScreen, layers) => {
  if (compositionMedia.drawVisualStack) {
    compositionMedia.drawVisualStack(ctx, window, drawScreen, layers);
    return;
  }
  for (const clip of layers.cameraVisuals) {
    if (clip.kind === 'screen') drawScreen();
    else compositionMedia.drawComposition(ctx, window, clip.id);
  }
};
const cursorOverlay = useCursorOverlay({
  cursorSelection: () => props.cursorSelection,
  cursorPack: () => props.cursorPack,
  cursorSize: () => props.cursorSize,
  cursorColor: () => props.cursorColor,
  enableShadow: () => props.enableShadow,
  clickEffects: () => props.clickEffects,
  motion: () => props.motion,
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
watch(() => props.outputCanvas, renderOnce, { deep: true });
watch(() => [props.composition, props.currentTime, props.frameVersion, props.isCropping] as const, renderOnce, {
  deep: true,
});
watch(() => [props.zoomElements, props.selectedZoom] as const, cameraZoom.resetCameraUnlessDragging, { deep: true });
watch(
  () =>
    [
      props.cursorSelection,
      props.cursorPack,
      props.cursorSize,
      props.cursorColor,
      props.enableShadow,
      props.shadowBlur,
      props.shadowColor,
      props.shadowDirection,
      props.clickEffects,
      props.motion,
    ] as const,
  renderOnce,
  { deep: true },
);
watch(transformAndCrop.transformDraft, renderOnce, { deep: true });
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
const drawCanvasScene = (ctx: CanvasRenderingContext2D) => {
  const window = cameraZoom.drawVideoWindow(ctx, logicalSize.value.width, logicalSize.value.height, screenFrame.value);
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
    compositionMedia.drawComposition(ctx, window);
  } else {
    currentRenderWindow = null;
    cursorOverlay.clearCursorBounds();
    const preview = outputPreviewRect(logicalSize.value.width, logicalSize.value.height, props.outputCanvas);
    const fallbackWindow = {
      dx: preview.x,
      dy: preview.y,
      dw: preview.width,
      dh: preview.height,
      scale: 1,
      focusX: preview.x + preview.width / 2,
      focusY: preview.y + preview.height / 2,
    };
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(preview.x, preview.y, preview.width, preview.height, OUTPUT_PREVIEW_RADIUS);
    ctx.clip();
    drawBackground(ctx, preview);
    drawNonScreenVisuals(ctx, fallbackWindow);
    compositionMedia.drawComposition(ctx, fallbackWindow);
    ctx.restore();
  }
  const preview = outputPreviewRect(logicalSize.value.width, logicalSize.value.height, props.outputCanvas);
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
function draw() {
  animationFrameId = null;
  renderCanvas();
  if (props.isPlaying || isTransitioningBackground.value) animationFrameId = requestAnimationFrame(draw);
}
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
  onDoneCrop: () => emit('done:crop'),
});
onUnmounted(() => {
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
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
      <div
        v-if="selectedTransformClip && !selectedCaptionFollowsCursor && !isCropping && selectedZoom?.mode !== 'manual'"
        class="transform-selection-viewport"
        :style="transformAndCrop.transformSelectionViewportStyle.value"
      >
        <div
          class="webcam-selection"
          :class="{ 'is-muted': transformHandlesMuted }"
          :style="transformAndCrop.transformHandleStyle.value"
          @pointerdown="handleTransformPointerDown"
          @pointermove="transformAndCrop.moveTransformDrag"
          @pointerup="transformAndCrop.endTransformDrag"
          @pointercancel="transformAndCrop.endTransformDrag"
        >
          <ResizeHandle
            :corners="transformAndCrop.transformResizeCorners.value"
            @resize-start="(corner, event) => transformAndCrop.beginTransformDrag(event, 'resize', corner)"
            @resize-move="(_corner, event) => transformAndCrop.moveTransformDrag(event)"
            @resize-end="(_corner, event) => transformAndCrop.endTransformDrag(event)"
          />
        </div>
      </div>
      <div
        v-if="isCropping && selectedTransformClip"
        class="crop-container"
        :style="transformAndCrop.cropContainerStyle.value"
      >
        <div class="crop-mask-wrapper">
          <div class="crop-mask-hole" :style="transformAndCrop.cropOverlayStyle.value" />
        </div>
        <div
          class="crop-overlay-box"
          :style="transformAndCrop.cropOverlayStyle.value"
          @pointerdown="transformAndCrop.beginCropDrag($event, 'move')"
          @pointermove="transformAndCrop.moveCropDrag"
          @pointerup="transformAndCrop.endCropDrag"
          @pointercancel="transformAndCrop.endCropDrag"
        >
          <div class="crop-grid">
            <div class="grid-line vertical line-1" />
            <div class="grid-line vertical line-2" />
            <div class="grid-line horizontal line-1" />
            <div class="grid-line horizontal line-2" />
          </div>
          <div class="crop-done-wrapper" @pointerdown.stop @mousedown.stop>
            <Button variant="primary" size="xs" :icon="Check" class="crop-ok-button" @click.stop="commitCrop">{{
              t('ok')
            }}</Button>
          </div>
          <ResizeHandle
            @resize-start="(corner, event) => transformAndCrop.beginCropDrag(event, 'resize', corner)"
            @resize-move="(_corner, event) => transformAndCrop.moveCropDrag(event)"
            @resize-end="(_corner, event) => transformAndCrop.endCropDrag(event)"
          />
        </div>
      </div>
    </div>
    <UndoRedoToast :action="historyAction ?? null" />
  </div>
</template>
<style scoped src="./EditorCanvas.css"></style>
