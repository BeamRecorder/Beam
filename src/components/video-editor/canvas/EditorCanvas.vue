<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from "vue";
import { Check } from "@lucide/vue";
import Button from "../../ui/button/Button.vue";
import Skeleton from "../../ui/skeleton/Skeleton.vue";
import ResizeHandle from '../../ui/ResizeHandle.vue';
import type { ProjectEditorData } from "../../../api/types/capture-api";
import type { CursorType } from "../properties/cursor/useCursorReplacer";
import type { BackgroundValue } from "../composables/backgroundCatalog";
import type { ZoomElement } from "../zoom/zoom-types";
import type { MediaCompositionLayer, NormalizedTransform, ProjectComposition, NormalizedCrop } from '../composition/composition-types';
import { outputPreviewRect, type OutputCanvasSettings } from './output-canvas';

import { useCanvasBackground } from './composables/useCanvasBackground';
import { useCanvasVideoElement } from './composables/useCanvasVideoElement';
import { useCompositionMedia } from './composables/useCompositionMedia';
import { useCursorOverlay } from './composables/useCursorOverlay';
import { useCameraZoom } from './composables/useCameraZoom';
import { useLayerTransformAndCrop } from './composables/useLayerTransformAndCrop';

const props = defineProps<{
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  selectedCursor: CursorType;
  cursorSize: number;
  cursorColor: string;
  enableShadow: boolean;
  enableRipple: boolean;
  shadowBlur: number;
  shadowColor: string;
  rippleColor: string;
  rippleSize: number;
  isVideoEnabled: boolean;
  selectedBackground: BackgroundValue | null;
  backgroundBlurPercent?: number;
  videoSrc: string;
  editorData?: ProjectEditorData | null;
  zoomElements: ZoomElement[];
  selectedZoom: ZoomElement | null;
  composition: ProjectComposition;
  outputCanvas: OutputCanvasSettings;
  activeTab: string;
  selectedTransformLayer: MediaCompositionLayer | null;
  loopProgress?: number;
  isCropping?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:isPlaying", value: boolean): void;
  (e: "update:currentTime", value: number): void;
  (e: "duration-change", value: number): void;
  (e: "update:zoom", value: ZoomElement): void;
  (e: "preview:zoom", value: ZoomElement): void;
  (e: 'select:transform-layer', layerId: string): void;
  (e: 'deselect:transform-layer'): void;
  (e: 'deselect:zoom'): void;
  (e: 'update:layer-transform', transform: NormalizedTransform): void;
  (e: 'preview:layer-transform', transform: NormalizedTransform): void;
  (e: 'update:layer-crop', crop: NormalizedCrop): void;
  (e: 'select:base-video'): void;
  (e: 'select:canvas'): void;
  (e: 'done:crop'): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);

const logicalSize = ref({ width: 0, height: 0 });
const deviceScale = ref(1);

const previewFrameStyle = computed(() => {
  const preview = outputPreviewRect(logicalSize.value.width, logicalSize.value.height, props.outputCanvas);
  return { left: `${preview.x}px`, top: `${preview.y}px`, width: `${preview.width}px`, height: `${preview.height}px` };
});

const isFormatTransitioning = ref(false);
let formatTransitionTimer: ReturnType<typeof setTimeout> | null = null;
let resizeObserver: ResizeObserver | null = null;
let animationFrameId: number | null = null;

function renderOnce() {
  if (animationFrameId === null) {
    animationFrameId = requestAnimationFrame(draw);
  }
}

// 1. HTMLVideoElement management & playback sync
const { videoEl, videoError, isVideoFrameReady } = useCanvasVideoElement({
  videoSrc: () => props.videoSrc,
  editorData: () => props.editorData,
  isPlaying: () => props.isPlaying,
  currentTime: () => props.currentTime,
  playbackRate: () => props.composition.baseVideoPlaybackRate ?? 1.0,
  onDurationChange: (duration) => emit('duration-change', duration),
  onRenderOnce: renderOnce,
});

// 2. Background drawing & video sync
const { drawBackground, syncVideoPlayback, isTransitioningBackground } = useCanvasBackground(
  () => props.selectedBackground,
  () => props.backgroundBlurPercent,
  () => renderOnce(),
);

watch(
  () => props.isPlaying,
  (playing) => {
    syncVideoPlayback(playing);
    if (!playing) {
      cameraZoom.resetCamera();
    }
  },
);

// 3. Layer Transform & Crop drag handling
const transformAndCrop = useLayerTransformAndCrop({
  composition: () => props.composition,
  currentTime: () => props.currentTime,
  selectedTransformLayer: () => props.selectedTransformLayer,
  videoWindowBounds: () => cameraZoom.videoWindowBounds.value,
  overlayWindowBounds: () => cameraZoom.overlayWindowBounds.value,
  isCropping: () => props.isCropping,
  onUpdateLayerTransform: (transform) => emit('update:layer-transform', transform),
  onPreviewLayerTransform: (transform) => emit('preview:layer-transform', transform),
  onUpdateLayerCrop: (crop) => emit('update:layer-crop', crop),
  onSelectTransformLayer: (layerId) => emit('select:transform-layer', layerId),
});

// 4. Camera & Zoom spring mechanics
const cameraZoom = useCameraZoom({
  canvasRef: () => canvasRef.value,
  outputCanvas: () => props.outputCanvas,
  isVideoEnabled: () => props.isVideoEnabled,
  zoomElements: () => props.zoomElements,
  selectedZoom: () => props.selectedZoom,
  currentTime: () => props.currentTime,
  isPlaying: () => props.isPlaying,
  editorData: () => props.editorData,
  activeTab: () => props.activeTab,
  composition: () => props.composition,
  isCropping: () => props.isCropping,
  drawBackground,
  videoError: () => videoError.value,
  onUpdateZoom: (zoom) => emit('update:zoom', zoom),
  onPreviewZoom: (zoom) => emit('preview:zoom', zoom),
  onSelectBaseVideo: () => emit('select:base-video'),
  onSelectCanvas: () => emit('select:canvas'),
  onDeselectTransformLayer: () => emit('deselect:transform-layer'),
  onDeselectZoom: () => emit('deselect:zoom'),
  selectWebcamAt: (event) => transformAndCrop.selectWebcamAt(event, canvasRef.value),
  selectedTransformLayerExists: () => Boolean(props.selectedTransformLayer),
});

const isMasterPlaying = () => {
  if (!props.isPlaying) return false;
  if (!props.isVideoEnabled || !videoEl.src) return true;
  return !videoEl.seeking && !videoEl.paused && videoEl.readyState >= 2;
};

// 5. Secondary Media & Composition Rendering
const compositionMedia = useCompositionMedia({
  composition: () => props.composition,
  currentTime: () => props.currentTime,
  isPlaying: isMasterPlaying,
  selectedTransformLayer: () => props.selectedTransformLayer,
  webcamDraft: () => transformAndCrop.webcamDraft.value,
  isCropping: () => props.isCropping,
  onRenderOnce: () => renderOnce(),
});

watch(isMasterPlaying, () => renderOnce());

// 6. Custom Cursor & Ripples Rendering
const cursorOverlay = useCursorOverlay({
  selectedCursor: () => props.selectedCursor,
  cursorSize: () => props.cursorSize,
  cursorColor: () => props.cursorColor,
  enableShadow: () => props.enableShadow,
  enableRipple: () => props.enableRipple,
  shadowBlur: () => props.shadowBlur,
  shadowColor: () => props.shadowColor,
  rippleColor: () => props.rippleColor,
  rippleSize: () => props.rippleSize,
  deviceScale: () => deviceScale.value,
  currentTime: () => props.currentTime,
  isPlaying: () => props.isPlaying,
  editorData: () => props.editorData,
  composition: () => props.composition,
  isVideoEnabled: () => props.isVideoEnabled,
  showBackground: () => props.outputCanvas.showBackground,
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

watch(
  () => [props.composition, props.currentTime, props.isCropping] as const,
  () => renderOnce(),
  { deep: true },
);

watch(transformAndCrop.webcamDraft, () => renderOnce(), { deep: true });

const resizeCanvas = () => {
  const canvas = canvasRef.value;
  const container = containerRef.value;
  if (!canvas || !container) return;

  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  deviceScale.value = dpr;
  logicalSize.value = { width, height };

  const backingWidth = Math.max(1, Math.round(width * dpr));
  const backingHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;

  renderCanvas();
};

const renderCanvas = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = logicalSize.value;
  if (!width || !height) return;

  ctx.setTransform(deviceScale.value, 0, 0, deviceScale.value, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, width, height);

  const videoWindow = cameraZoom.drawVideoWindow(ctx, width, height, videoEl);

  if (videoWindow) {
    cameraZoom.drawInCameraSpace(ctx, videoWindow, () =>
      compositionMedia.drawComposition(ctx, videoWindow, videoEl.videoWidth || 1920, true),
    );
    compositionMedia.drawWebcamLayers(ctx, videoWindow);
    compositionMedia.drawComposition(ctx, videoWindow, videoEl.videoWidth || 1920, false);
    cursorOverlay.updateAndDrawRipplesAndCursor(
      ctx,
      videoWindow,
      videoEl.videoWidth || 1920,
      videoEl.videoHeight || 1080,
      width,
      (drawContent) => cameraZoom.drawInCameraSpace(ctx, videoWindow, drawContent),
    );
  }

  if (props.isPlaying && videoEl.readyState >= 1) {
    const rate = props.composition.baseVideoPlaybackRate ?? 1.0;
    emit("update:currentTime", videoEl.ended ? 0 : videoEl.currentTime / rate);
  }
};

const commitCrop = () => {
  transformAndCrop.commitCrop();
  emit('done:crop');
};

function draw() {
  animationFrameId = null;
  renderCanvas();
  if (props.isPlaying || isTransitioningBackground.value) {
    animationFrameId = requestAnimationFrame(draw);
  }
}

onMounted(() => {
  resizeCanvas();
  resizeObserver = new ResizeObserver(resizeCanvas);
  if (containerRef.value) resizeObserver.observe(containerRef.value);
  renderOnce();
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (formatTransitionTimer) clearTimeout(formatTransitionTimer);
});
</script>

<template>
  <div class="canvas-island" ref="containerRef">
    <div class="preview-frame" :style="previewFrameStyle" aria-hidden="true"></div>
    <canvas
      ref="canvasRef"
      class="editor-canvas"
      :class="{ 'is-selection-editable': selectedZoom?.mode === 'manual', 'is-format-transitioning': isFormatTransitioning }"
      @pointerdown="cameraZoom.beginSelectionMove"
      @pointermove="cameraZoom.moveSelection"
      @pointerup="cameraZoom.endSelectionMove"
      @pointercancel="cameraZoom.endSelectionMove"
    ></canvas>
    <Skeleton
      v-if="!isVideoFrameReady && !videoError"
      class="canvas-loading-skeleton"
      width="100%"
      height="100%"
      radius="var(--radius-lg)"
      aria-label="Video preview loading"
    />
    <div v-if="selectedTransformLayer && !isCropping" class="webcam-selection" :style="transformAndCrop.webcamHandleStyle.value" @pointerdown="transformAndCrop.beginWebcamDrag($event, 'move')" @pointermove="transformAndCrop.moveWebcamDrag" @pointerup="transformAndCrop.endWebcamDrag" @pointercancel="transformAndCrop.endWebcamDrag">
      <ResizeHandle @resize-start="(corner, event) => transformAndCrop.beginWebcamDrag(event, 'resize', corner)" @resize-move="(_corner, event) => transformAndCrop.moveWebcamDrag(event)" @resize-end="(_corner, event) => transformAndCrop.endWebcamDrag(event)" />
    </div>
    <div
      class="zoom-selection-box"
      :class="{ locked: selectedZoom?.mode !== 'manual' }"
      :style="cameraZoom.focusTargetStyle.value"
      aria-hidden="true"
    ></div>

    <div v-if="isCropping && selectedTransformLayer" class="crop-overlay-box" :style="transformAndCrop.cropOverlayStyle.value" @pointerdown="transformAndCrop.beginCropDrag($event, 'move')" @pointermove="transformAndCrop.moveCropDrag" @pointerup="transformAndCrop.endCropDrag" @pointercancel="transformAndCrop.endCropDrag">
      <div class="crop-grid">
        <div class="grid-line vertical line-1"></div>
        <div class="grid-line vertical line-2"></div>
        <div class="grid-line horizontal line-1"></div>
        <div class="grid-line horizontal line-2"></div>
      </div>
      <div class="crop-done-wrapper" @pointerdown.stop @mousedown.stop>
        <Button
          variant="primary"
          size="xs"
          :icon="Check"
          @click.stop="commitCrop"
        >
          OK
        </Button>
      </div>
      <ResizeHandle @resize-start="(corner, event) => transformAndCrop.beginCropDrag(event, 'resize', corner)" @resize-move="(_corner, event) => transformAndCrop.moveCropDrag(event)" @resize-end="(_corner, event) => transformAndCrop.endCropDrag(event)" />
    </div>
  </div>
</template>

<style scoped>
.canvas-island {
  flex: 1;
  margin: 0 12px;
  background: transparent;
  position: relative;
  overflow: visible;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 0;
}

.editor-canvas {
  width: 100%;
  height: 100%;
  display: block;
  position: relative;
  z-index: 1;
}

.canvas-loading-skeleton {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}

.preview-frame { position: absolute; z-index: 0; border-radius: var(--radius-lg); background: var(--color-bg-element); box-shadow: var(--shadow-lg); pointer-events: none; }

.editor-canvas.is-selection-editable {
  cursor: move;
}

.webcam-selection {
  position: absolute;
  z-index: 2;
  border: 2px solid var(--color-primary);
  box-sizing: border-box;
  cursor: move;
}

.zoom-selection-box {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  border: 2px dashed rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);
  pointer-events: none;
  border-radius: var(--radius-md);
  box-sizing: border-box;
  contain: layout style;
}

.zoom-selection-box.locked {
  border-style: solid;
  border-color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.03);
}

.crop-overlay-box {
  position: absolute;
  z-index: 4;
  border: 2px solid var(--color-primary, #ff5a1f);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
  cursor: move;
  box-sizing: border-box;
}

.crop-done-wrapper {
  position: absolute;
  top: calc(100% - 24px);
  left: calc(100% + 8px);
  z-index: 10;
  white-space: nowrap;
  pointer-events: auto;
}

.crop-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.grid-line {
  position: absolute;
  background: rgba(255, 255, 255, 0.35);
}

.grid-line.vertical {
  top: 0;
  bottom: 0;
  width: 1px;
}
.grid-line.vertical.line-1 { left: 33.333%; }
.grid-line.vertical.line-2 { left: 66.666%; }

.grid-line.horizontal {
  left: 0;
  right: 0;
  height: 1px;
}
.grid-line.horizontal.line-1 { top: 33.333%; }
.grid-line.horizontal.line-2 { top: 66.666%; }

.is-format-transitioning {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
