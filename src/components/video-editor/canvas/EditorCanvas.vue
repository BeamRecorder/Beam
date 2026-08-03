<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { Check } from "@lucide/vue";
import Button from "../../ui/button/Button.vue";
import Skeleton from "../../ui/skeleton/Skeleton.vue";
import ResizeHandle from "~/ui/ResizeHandle/ResizeHandle.vue";
import UndoRedoToast from "./UndoRedoToast.vue";
import type { HistoryAction } from "../composables/useEditorUndoRedo";
import type { ProjectEditorData } from "../../../api/types/capture-api";
import type { CursorType } from "../properties/cursor/useCursorReplacer";
import type { ShadowDirection } from "../properties/cursor/shadow-types";
import type { CursorClickEffects } from "../../../api/types/cursor-settings";
import type { CursorMotionSettings } from "../../../api/types/cursor-settings";
import type { BackgroundValue } from "../composables/backgroundCatalog";
import type { ZoomElement } from "../zoom/zoom-types";
import { activeClipsAt, sourceTimeAt } from "../composition/engine/clip-engine";
import {
  isVisualClip,
  clipEndMs,
  type CaptionClip,
  type ClipComposition,
  type NormalizedCrop,
  type NormalizedTransform,
  type VisualClip,
} from "../composition/composition-types";
import { outputPreviewRect, type OutputCanvasSettings } from "./output-canvas";
import { useCanvasBackground } from "./composables/useCanvasBackground";
import { useCanvasVideoElement } from "./composables/useCanvasVideoElement";
import { useCompositionMedia } from "./composables/useCompositionMedia";
import { useCursorOverlay } from "./composables/useCursorOverlay";
import { useCameraZoom } from "./composables/useCameraZoom";
import { useLayerTransformAndCrop } from "./composables/useLayerTransformAndCrop";
import { useViewportZoom } from "./composables/useViewportZoom";
import { useTranslate } from "~/i18n/useTranslate";

const { t } = useTranslate("EditorCanvas");
type TransformClip = VisualClip | CaptionClip;

const props = defineProps<{
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  selectedCursor: CursorType;
  cursorSize: number;
  cursorColor: string;
  enableShadow: boolean;
  shadowBlur: number;
  shadowColor: string;
  shadowDirection: ShadowDirection;
  clickEffects: CursorClickEffects;
  motion: CursorMotionSettings;
  selectedBackground: BackgroundValue | null;
  backgroundBlurPercent?: number;
  videoSrc?: string | null;
  editorData?: ProjectEditorData | null;
  zoomElements: ZoomElement[];
  selectedZoom: ZoomElement | null;
  composition: ClipComposition;
  outputCanvas: OutputCanvasSettings;
  activeTab: string;
  selectedTransformClip: TransformClip | null;
  loopProgress?: number;
  isCropping?: boolean;
  historyAction?: HistoryAction | null;
}>();

const emit = defineEmits<{
  (e: "update:isPlaying", value: boolean): void;
  (e: "update:currentTime", value: number): void;
  (e: "duration-change", value: number): void;
  (e: "update:zoom", value: ZoomElement): void;
  (e: "preview:zoom", value: ZoomElement): void;
  (e: "select:clip", clipId: string): void;
  (e: "deselect:transform-clip"): void;
  (e: "deselect:zoom"): void;
  (e: "update:clip-transform", transform: NormalizedTransform): void;
  (e: "preview:clip-transform", transform: NormalizedTransform): void;
  (e: "update:clip-crop", crop: NormalizedCrop): void;
  (e: "select:canvas"): void;
  (e: "done:crop"): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const logicalSize = ref({ width: 0, height: 0 });
const deviceScale = ref(1);
const isFormatTransitioning = ref(false);
let formatTransitionTimer: ReturnType<typeof setTimeout> | null = null;
let resizeObserver: ResizeObserver | null = null;
let animationFrameId: number | null = null;
let playbackAnchorSeconds = 0;
let playbackAnchorTime = performance.now();
let drawVisualStack: ((ctx: CanvasRenderingContext2D, videoWindow: { dx: number; dy: number; dw: number; dh: number; scale: number; focusX: number; focusY: number }, drawScreen: () => void) => void) | null = null;

const viewportZoom = useViewportZoom();

const resetPlaybackClock = (seconds = props.currentTime) => {
  playbackAnchorSeconds = Math.max(0, Math.min(props.duration, seconds));
  playbackAnchorTime = performance.now();
};
const playbackClockSeconds = () => playbackAnchorSeconds + (performance.now() - playbackAnchorTime) / 1_000;

const primaryScreenClip = computed<VisualClip | null>(() =>
  props.composition.clips.find((clip): clip is VisualClip => clip.kind === "screen" && clip.enabled) ?? null,
);
const liveScreenClip = computed<VisualClip | null>(() =>
  activeClipsAt(props.composition, props.currentTime * 1_000).find((clip): clip is VisualClip => clip.kind === "screen") ?? null,
);
const displayScreenClip = computed<VisualClip | null>(() => {
  if (liveScreenClip.value) return liveScreenClip.value;
  const clip = primaryScreenClip.value;
  return clip && props.currentTime * 1_000 >= clip.timelineStartMs ? clip : null;
});
const screenAsset = computed(() => {
  const clip = primaryScreenClip.value;
  return clip ? props.composition.assets.find((asset) => asset.id === clip.assetId) ?? null : null;
});
const activeScreenSourceTime = computed(() => {
  const clip = displayScreenClip.value;
  if (!clip) return primaryScreenClip.value?.sourceInMs ? primaryScreenClip.value.sourceInMs / 1_000 : 0;
  const timelineMs = Math.min(Math.max(props.currentTime * 1_000, clip.timelineStartMs), clipEndMs(clip) - 1);
  return (sourceTimeAt(clip, timelineMs) ?? clip.sourceInMs) / 1_000;
});
const previewFrameStyle = computed(() => {
  const preview = outputPreviewRect(logicalSize.value.width, logicalSize.value.height, props.outputCanvas);
  return { left: `${preview.x}px`, top: `${preview.y}px`, width: `${preview.width}px`, height: `${preview.height}px` };
});

function renderOnce() {
  if (animationFrameId === null) animationFrameId = requestAnimationFrame(draw);
}

const { videoEl, videoError, isVideoFrameReady } = useCanvasVideoElement({
  videoSrc: () => screenAsset.value?.src ?? props.videoSrc ?? "",
  isPlaying: () => props.isPlaying && Boolean(liveScreenClip.value),
  sourceTime: () => activeScreenSourceTime.value,
  playbackRate: () => displayScreenClip.value?.playbackRate ?? 1,
  onDurationChange: () => undefined,
  onRenderOnce: renderOnce,
});
const { drawBackground, syncVideoPlayback, isTransitioningBackground } = useCanvasBackground(
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
  overlayWindowBounds: () => cameraZoom.overlayWindowBounds.value,
  isCropping: () => props.isCropping,
  zoomScale: () => viewportZoom.zoomScale.value,
  onUpdateTransform: (transform) => emit("update:clip-transform", transform),
  onPreviewTransform: (transform) => emit("preview:clip-transform", transform),
  onUpdateCrop: (crop) => emit("update:clip-crop", crop),
  onSelectTransformClip: (clipId) => emit("select:clip", clipId),
});

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
  videoError: () => videoError.value,
  renderVisualStack: (ctx, window, drawScreen) => drawVisualStack?.(ctx, window, drawScreen),
  onUpdateZoom: (zoom) => emit("update:zoom", zoom),
  onPreviewZoom: (zoom) => emit("preview:zoom", zoom),
  onSelectScreenClip: (clipId) => emit("select:clip", clipId),
  onSelectCanvas: () => emit("select:canvas"),
  onDeselectTransformClip: () => emit("deselect:transform-clip"),
  onDeselectZoom: () => emit("deselect:zoom"),
  selectVisualAt: (event) => transformAndCrop.selectVisualAt(event, canvasRef.value),
  selectedTransformClipExists: () => Boolean(props.selectedTransformClip),
});

watch(() => props.isPlaying, (playing) => {
  resetPlaybackClock();
  syncVideoPlayback(playing);
  if (!playing) cameraZoom.resetCamera();
});
watch(() => props.currentTime, (time) => {
  if (!props.isPlaying) {
    resetPlaybackClock(time);
    return;
  }
  if (Math.abs(time - playbackClockSeconds()) > .25) resetPlaybackClock(time);
});
watch(() => props.duration, () => resetPlaybackClock());

const isMasterPlaying = () => props.isPlaying;
const compositionMedia = useCompositionMedia({
  composition: () => props.composition,
  currentTime: () => props.currentTime,
  isPlaying: isMasterPlaying,
  selectedTransformClip: () => props.selectedTransformClip,
  transformDraft: () => transformAndCrop.transformDraft.value,
  isCropping: () => props.isCropping,
  onRenderOnce: renderOnce,
});

const drawNonScreenVisuals = (
  ctx: CanvasRenderingContext2D,
  window: { dx: number; dy: number; dw: number; dh: number; scale: number; focusX: number; focusY: number },
) => {
  const clips = activeClipsAt(props.composition, props.currentTime * 1_000)
    .filter((clip) => isVisualClip(clip) && clip.kind !== "screen")
    .sort((left, right) => right.order - left.order);
  for (const clip of clips) {
    if (clip.kind === "webcam") compositionMedia.drawWebcamClips(ctx, window, clip.id);
    else compositionMedia.drawComposition(ctx, window, videoEl.videoWidth || 1920, clip.id);
  }
};

drawVisualStack = (ctx, window, drawScreen) => {
  const clips = activeClipsAt(props.composition, props.currentTime * 1_000)
    .filter((clip) => isVisualClip(clip))
    .sort((left, right) => right.order - left.order);
  for (const clip of clips) {
    if (clip.kind === "screen") drawScreen();
    else if (clip.kind === "webcam") compositionMedia.drawWebcamClips(ctx, window, clip.id);
    else compositionMedia.drawComposition(ctx, window, videoEl.videoWidth || 1920, clip.id);
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

watch(() => `${props.outputCanvas.width}:${props.outputCanvas.height}:${props.outputCanvas.showBackground}`, () => {
  isFormatTransitioning.value = true;
  if (formatTransitionTimer) clearTimeout(formatTransitionTimer);
  formatTransitionTimer = setTimeout(() => { isFormatTransitioning.value = false; }, 260);
  renderOnce();
});
watch(() => [props.composition, props.currentTime, props.isCropping] as const, renderOnce, { deep: true });
watch(() => [props.selectedCursor, props.cursorSize, props.cursorColor, props.enableShadow, props.shadowBlur, props.shadowColor, props.shadowDirection, props.clickEffects, props.motion] as const, renderOnce, { deep: true });
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
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx || !logicalSize.value.width || !logicalSize.value.height) return;
  ctx.setTransform(deviceScale.value, 0, 0, deviceScale.value, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, logicalSize.value.width, logicalSize.value.height);
  const window = cameraZoom.drawVideoWindow(ctx, logicalSize.value.width, logicalSize.value.height, videoEl);
  if (window) {
    compositionMedia.drawComposition(ctx, window, videoEl.videoWidth || 1920);
    cursorOverlay.updateAndDrawRipplesAndCursor(
      ctx,
      window,
      videoEl.videoWidth || 1920,
      videoEl.videoHeight || 1080,
      logicalSize.value.width,
      (drawContent) => cameraZoom.drawInCameraSpace(ctx, window, drawContent),
    );
  } else {
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
    compositionMedia.drawComposition(ctx, fallbackWindow, videoEl.videoWidth || 1920);
    ctx.restore();
  }
  if (props.isPlaying) {
    const nextTime = playbackClockSeconds();
    if (props.duration > 0 && nextTime >= props.duration) {
      resetPlaybackClock(0);
      emit("update:currentTime", 0);
    } else if (props.duration <= 0) {
      resetPlaybackClock(0);
      emit("update:currentTime", 0);
      emit("update:isPlaying", false);
    } else {
      emit("update:currentTime", Math.max(0, nextTime));
    }
  }
};
const commitCrop = () => { transformAndCrop.commitCrop(); emit("done:crop"); };
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
  resetPlaybackClock();
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
    :class="{ 'is-grabbing': viewportZoom.isPanning.value, 'is-space-pressed': viewportZoom.isSpacePressed.value }"
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
        :class="{ 'is-selection-editable': selectedZoom?.mode === 'manual', 'is-format-transitioning': isFormatTransitioning }"
      ></canvas>
      <Skeleton v-if="!isVideoFrameReady && !videoError" class="canvas-loading-skeleton" width="100%" height="100%" radius="var(--radius-lg)" :aria-label="t('videoPreviewLoading')" />
      <div v-if="selectedTransformClip && !isCropping" class="webcam-selection" :style="transformAndCrop.transformHandleStyle.value" @pointerdown="transformAndCrop.beginTransformDrag($event, 'move')" @pointermove="transformAndCrop.moveTransformDrag" @pointerup="transformAndCrop.endTransformDrag" @pointercancel="transformAndCrop.endTransformDrag">
        <ResizeHandle @resize-start="(corner, event) => transformAndCrop.beginTransformDrag(event, 'resize', corner)" @resize-move="(_corner, event) => transformAndCrop.moveTransformDrag(event)" @resize-end="(_corner, event) => transformAndCrop.endTransformDrag(event)" />
      </div>
      <div class="zoom-selection-box" :class="{ locked: selectedZoom?.mode !== 'manual' }" :style="cameraZoom.focusTargetStyle.value" aria-hidden="true"></div>
      <div v-if="isCropping && selectedTransformClip" class="crop-overlay-box" :style="transformAndCrop.cropOverlayStyle.value" @pointerdown="transformAndCrop.beginCropDrag($event, 'move')" @pointermove="transformAndCrop.moveCropDrag" @pointerup="transformAndCrop.endCropDrag" @pointercancel="transformAndCrop.endCropDrag">
        <div class="crop-grid">
          <div class="grid-line vertical line-1"></div><div class="grid-line vertical line-2"></div>
          <div class="grid-line horizontal line-1"></div><div class="grid-line horizontal line-2"></div>
        </div>
        <div class="crop-done-wrapper" @pointerdown.stop @mousedown.stop>
          <Button variant="primary" size="xs" :icon="Check" @click.stop="commitCrop">{{ t('ok') }}</Button>
        </div>
        <ResizeHandle @resize-start="(corner, event) => transformAndCrop.beginCropDrag(event, 'resize', corner)" @resize-move="(_corner, event) => transformAndCrop.moveCropDrag(event)" @resize-end="(_corner, event) => transformAndCrop.endCropDrag(event)" />
      </div>
    </div>
    <UndoRedoToast :action="historyAction ?? null" />
  </div>
</template>

<style scoped>
.canvas-island {
  flex: 1;
  margin: 0 12px;
  background: transparent;
  position: relative;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 0;
  user-select: none;
}
.canvas-island.is-space-pressed { cursor: grab !important; }
.canvas-island.is-grabbing { cursor: grabbing !important; }
.canvas-viewport {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
}
.editor-canvas { width: 100%; height: 100%; display: block; position: relative; z-index: 1; }
.canvas-loading-skeleton { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
.preview-frame { position: absolute; z-index: 0; border-radius: var(--radius-lg); background: var(--color-bg-element); box-shadow: var(--shadow-lg); pointer-events: none; }
.editor-canvas.is-selection-editable { cursor: move; }
.webcam-selection { position: absolute; z-index: 2; border: 2px solid var(--color-primary); box-sizing: border-box; cursor: move; }
.zoom-selection-box { position: absolute; top: 0; left: 0; z-index: 2; border: 2px dashed rgba(255,255,255,.9); background: rgba(255,255,255,.08); box-shadow: 0 0 0 9999px rgba(0,0,0,.35); pointer-events: none; border-radius: var(--radius-md); box-sizing: border-box; contain: layout style; }
.zoom-selection-box.locked { border-style: solid; border-color: rgba(255,255,255,.4); background: rgba(255,255,255,.03); }
.crop-overlay-box { position: absolute; z-index: 4; border: 2px solid var(--color-primary, #ff5a1f); box-shadow: 0 0 0 9999px rgba(0,0,0,.5); cursor: move; box-sizing: border-box; }
.crop-done-wrapper { position: absolute; top: calc(100% - 24px); left: calc(100% + 8px); z-index: 10; white-space: nowrap; pointer-events: auto; }
.crop-grid { position: absolute; inset: 0; pointer-events: none; }
.grid-line { position: absolute; background: rgba(255,255,255,.35); }
.grid-line.vertical { top: 0; bottom: 0; width: 1px; }
.grid-line.vertical.line-1 { left: 33.333%; }.grid-line.vertical.line-2 { left: 66.666%; }
.grid-line.horizontal { left: 0; right: 0; height: 1px; }
.grid-line.horizontal.line-1 { top: 33.333%; }.grid-line.horizontal.line-2 { top: 66.666%; }
.is-format-transitioning { transition: transform .25s cubic-bezier(.4,0,.2,1); }
</style>
