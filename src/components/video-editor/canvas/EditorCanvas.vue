<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Check } from '@lucide/vue';
import Button from '../../ui/button/Button.vue';
import Skeleton from '../../ui/skeleton/Skeleton.vue';
import ResizeHandle from '~/ui/ResizeHandle/ResizeHandle.vue';
import UndoRedoToast from './UndoRedoToast.vue';
import { activeClipsAt } from '~/media/shared';
import type { VisualClip } from '~/media/shared/composition-types';
import { approximateCaptionTextWidth } from '~/media/shared/caption-text-layout';
import { outputPreviewRect } from './output-canvas';
import { useCanvasBackground } from './composables/useCanvasBackground';
import { useCompositionMedia } from './composables/useCompositionMedia';
import { useCursorOverlay } from './composables/useCursorOverlay';
import { useCameraZoom, type RenderedVideoWindow } from './composables/useCameraZoom';
import { useLayerTransformAndCrop } from './composables/useLayerTransformAndCrop';
import { useViewportZoom } from './composables/useViewportZoom';
import { useTranslate } from '~/i18n/useTranslate';
import { resolveCompositionSceneLayers } from '../composition/scene-layers';
import { canvasGuideLines } from './canvas-guides';
import type { EditorCanvasEmits, EditorCanvasProps } from './editor-canvas-types';

const { t } = useTranslate('EditorCanvas');
const props = defineProps<EditorCanvasProps>();
const emit = defineEmits<EditorCanvasEmits>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const logicalSize = ref({ width: 0, height: 0 });
const deviceScale = ref(1);
const isFormatTransitioning = ref(false);
let formatTransitionTimer: ReturnType<typeof setTimeout> | null = null;
let resizeObserver: ResizeObserver | null = null;
let animationFrameId: number | null = null;
let drawVisualStack:
  ((ctx: CanvasRenderingContext2D, videoWindow: RenderedVideoWindow, drawScreen: () => void) => void) | null = null;

const viewportZoom = useViewportZoom();
const measureCaptionText = (text: string, fontSize: number) => {
  const context = canvasRef.value?.getContext('2d');
  if (!context) return approximateCaptionTextWidth(text, fontSize);
  context.save();
  context.font = `800 ${fontSize}px sans-serif`;
  const width = context.measureText(text).width;
  context.restore();
  return width;
};

const liveScreenClip = computed<VisualClip | null>(
  () =>
    activeClipsAt(props.composition, props.currentTime * 1_000).find(
      (clip): clip is VisualClip => clip.kind === 'screen',
    ) ?? null,
);
const selectedCaptionFollowsCursor = computed(
  () =>
    props.selectedTransformClip?.kind === 'caption' &&
    props.selectedTransformClip.caption.type === 'keyboard' &&
    props.selectedTransformClip.caption.followCursor,
);
const screenFrame = computed(() => {
  // frameFor reads the playback engine's non-reactive cache. frameVersion is
  // the explicit invalidation signal emitted whenever that cache changes.
  void props.frameVersion;
  return liveScreenClip.value ? props.frameFor(liveScreenClip.value.id) : null;
});
const previewFrameStyle = computed(() => {
  const preview = outputPreviewRect(logicalSize.value.width, logicalSize.value.height, props.outputCanvas);
  return { left: `${preview.x}px`, top: `${preview.y}px`, width: `${preview.width}px`, height: `${preview.height}px` };
});

function renderOnce() {
  if (animationFrameId === null) animationFrameId = requestAnimationFrame(draw);
}

const { drawBackground, syncPlayback, isTransitioningBackground } = useCanvasBackground(
  () => props.selectedBackground,
  () => props.backgroundBlurPercent,
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
  measureCaptionText,
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
  selectedZoom: () => props.selectedZoom,
  currentTime: () => props.currentTime,
  isPlaying: () => props.isPlaying,
  editorData: () => props.editorData,
  activeTab: () => props.activeTab,
  composition: () => props.composition,
  isCropping: () => props.isCropping,
  drawBackground,
  videoError: () => props.playbackError?.message ?? null,
  renderVisualStack: (ctx, window, drawScreen) => drawVisualStack?.(ctx, window, drawScreen),
  onUpdateZoom: (zoom) => emit('update:zoom', zoom),
  onPreviewZoom: (zoom) => emit('preview:zoom', zoom),
  onSelectScreenClip: (clipId) => emit('select:clip', clipId),
  onSelectCanvas: () => emit('select:canvas'),
  onDeselectTransformClip: () => emit('deselect:transform-clip'),
  onDeselectZoom: () => emit('deselect:zoom'),
  selectVisualAt: (event) => transformAndCrop.selectVisualAt(event, canvasRef.value),
  selectedTransformClipExists: () => Boolean(props.selectedTransformClip),
});

watch(
  () => props.isPlaying,
  (playing) => {
    syncPlayback(playing);
    if (!playing) cameraZoom.resetCamera();
  },
);

const isMasterPlaying = () => props.isPlaying;
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
  const layers = resolveCompositionSceneLayers(props.composition, props.currentTime * 1_000);
  for (const clip of layers.cameraVisuals)
    if (clip.kind !== 'screen') compositionMedia.drawComposition(ctx, window, clip.id);
  compositionMedia.drawWebcamClips(ctx, window);
};

drawVisualStack = (ctx, window, drawScreen) => {
  const layers = resolveCompositionSceneLayers(props.composition, props.currentTime * 1_000);
  for (const clip of layers.cameraVisuals) {
    if (clip.kind === 'screen') drawScreen();
    else compositionMedia.drawComposition(ctx, window, clip.id);
  }
};

const cursorOverlay = useCursorOverlay({
  selectedCursor: () => props.selectedCursor,
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
  isScreenEnabled: () => Boolean(liveScreenClip.value),
  showBackground: () => props.outputCanvas.showBackground,
  onRenderOnce: renderOnce,
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
watch(() => [props.composition, props.currentTime, props.frameVersion, props.isCropping] as const, renderOnce, {
  deep: true,
});
watch(
  () =>
    [
      props.selectedCursor,
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
watch(isMasterPlaying, renderOnce);

const resizeCanvas = () => {
  const canvas = canvasRef.value;
  const container = containerRef.value;
  if (!canvas || !container) return;
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  deviceScale.value = dpr;
  logicalSize.value = { width, height };
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  renderCanvas();
};

const renderCanvas = () => {
  const canvas = canvasRef.value;
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx || !logicalSize.value.width || !logicalSize.value.height) return;
  ctx.setTransform(deviceScale.value, 0, 0, deviceScale.value, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, logicalSize.value.width, logicalSize.value.height);
  const window = cameraZoom.drawVideoWindow(ctx, logicalSize.value.width, logicalSize.value.height, screenFrame.value);
  if (window) {
    currentRenderWindow = window;
    compositionMedia.drawWebcamClips(ctx, window);
    compositionMedia.drawComposition(ctx, window);
    cursorOverlay.updateAndDrawRipplesAndCursor(
      ctx,
      window,
      screenFrame.value?.width ?? 1,
      screenFrame.value?.height ?? 1,
      logicalSize.value.width,
      (drawContent) => cameraZoom.drawInCameraSpace(ctx, window, drawContent),
    );
  } else {
    currentRenderWindow = null;
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
    ctx.roundRect(preview.x, preview.y, preview.width, preview.height, 16);
    ctx.clip();
    drawBackground(ctx, preview);
    drawNonScreenVisuals(ctx, fallbackWindow);
    compositionMedia.drawComposition(ctx, fallbackWindow);
    ctx.restore();
  }
};
const commitCrop = () => {
  transformAndCrop.commitCrop();
  emit('done:crop');
};
function draw() {
  animationFrameId = null;
  renderCanvas();
  if (props.isPlaying || isTransitioningBackground.value) animationFrameId = requestAnimationFrame(draw);
}

const handleIslandPointerDown = (event: PointerEvent) => {
  if (viewportZoom.beginPan(event, containerRef.value)) return;
  cameraZoom.beginSelectionMove(event);
};

const handleIslandPointerMove = (event: PointerEvent) => {
  if (viewportZoom.isPanning.value) {
    viewportZoom.movePan(event);
    return;
  }
  cameraZoom.moveSelection(event);
};

const handleIslandPointerUp = (event: PointerEvent) => {
  if (viewportZoom.isPanning.value) {
    viewportZoom.endPan(event, containerRef.value);
    return;
  }
  cameraZoom.endSelectionMove(event);
};

const handleIslandWheel = (event: WheelEvent) => {
  viewportZoom.handleWheel(event, containerRef.value?.getBoundingClientRect());
};

onMounted(() => {
  resizeCanvas();
  resizeObserver = new ResizeObserver(resizeCanvas);
  if (containerRef.value) resizeObserver.observe(containerRef.value);
  renderOnce();
});
onUnmounted(() => {
  resizeObserver?.disconnect();
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
  if (formatTransitionTimer) clearTimeout(formatTransitionTimer);
});

defineExpose({
  viewportZoom,
});
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
    @pointerdown="handleIslandPointerDown"
    @pointermove="handleIslandPointerMove"
    @pointerup="handleIslandPointerUp"
    @pointercancel="handleIslandPointerUp"
  >
    <div class="canvas-viewport" :style="viewportZoom.viewportStyle.value">
      <div class="preview-frame" :style="previewFrameStyle" aria-hidden="true"></div>
      <canvas
        ref="canvasRef"
        class="editor-canvas"
        :class="{
          'is-selection-editable': selectedZoom?.mode === 'manual',
          'is-format-transitioning': isFormatTransitioning,
        }"
      ></canvas>
      <div v-if="isGridVisible" class="canvas-3x3-grid" :style="previewFrameStyle">
        <div class="grid-line vertical line-1"></div>
        <div class="grid-line vertical line-2"></div>
        <div class="grid-line horizontal line-1"></div>
        <div class="grid-line horizontal line-2"></div>
      </div>
      <div
        v-for="(guide, index) in renderGuideLines"
        :key="index"
        class="canvas-guide-line"
        :class="guide.type"
        :style="guide.style"
      ></div>
      <Skeleton
        v-if="playbackState === 'loading' || (Boolean(liveScreenClip) && !screenFrame && !playbackError)"
        class="canvas-loading-skeleton"
        width="100%"
        height="100%"
        radius="var(--radius-lg)"
        :aria-label="t('videoPreviewLoading')"
      />
      <div
        v-if="selectedTransformClip && !selectedCaptionFollowsCursor && !isCropping && selectedZoom?.mode !== 'manual'"
        class="webcam-selection"
        :style="transformAndCrop.transformHandleStyle.value"
        @pointerdown="transformAndCrop.beginTransformDrag($event, 'move')"
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
      <div
        class="zoom-selection-box"
        :class="{ locked: selectedZoom?.mode !== 'manual' }"
        :style="cameraZoom.focusTargetStyle.value"
        aria-hidden="true"
      ></div>
      <div
        v-if="isCropping && selectedTransformClip"
        class="crop-container"
        :style="transformAndCrop.cropContainerStyle.value"
      >
        <div class="crop-mask-wrapper">
          <div class="crop-mask-hole" :style="transformAndCrop.cropOverlayStyle.value"></div>
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
            <div class="grid-line vertical line-1"></div>
            <div class="grid-line vertical line-2"></div>
            <div class="grid-line horizontal line-1"></div>
            <div class="grid-line horizontal line-2"></div>
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
