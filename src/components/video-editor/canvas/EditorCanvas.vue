<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from "vue";
import ResizeHandle, { type ResizeCorner } from '../../ui/ResizeHandle.vue';
import type { ProjectEditorData } from "../../../api/types/capture-api";
import type { CursorType } from "../composables/useCursorReplacer";
import type { BackgroundValue } from "../composables/backgroundCatalog";
import {
  buttonEventsBetween,
  cursorStateAt,
} from "../composables/cursorPlayback";
import { clampFocusToScale, zoomAtTime } from "../zoom/zoom-playback";
import {
  createCursorFollowCameraState,
  updateCursorFollowCamera,
} from "../zoom/zoom-camera";
import { createCameraVelocity, stepCameraSpring } from "../zoom/zoom-spring";
import { ZOOM_DEPTH_SCALES, type ZoomElement } from "../zoom/zoom-types";
import { useCursorReplacer } from "../composables/useCursorReplacer";
import {
  activeLayersAt,
  type ClipAppearance,
  type ProjectComposition,
} from "../composition/composition-types";
import { drawWebcamOverlay, webcamSettingsForAppearance } from "../composition/webcam/webcam-zoom";
import { framedMediaRect, outputPoint, coverSourceRect, outputPreviewRect, type OutputCanvasSettings } from './output-canvas';
import type { MediaCompositionLayer, NormalizedTransform } from '../composition/composition-types';
import { computeWebcamLayout } from '../composition/webcam/webcam-zoom';
import Skeleton from "../../ui/skeleton/Skeleton.vue";

const cursorHotspots: Record<CursorType, { x: number; y: number }> = {
  automatic: { x: 0, y: 0 },
  default: { x: 10, y: 7 },
  beachball: { x: 16, y: 16 },
  busy: { x: 7, y: 0 },
  cell: { x: 16, y: 16 },
  contextualmenu: { x: 8, y: 7 },
  copy: { x: 7, y: 0 },
  cross: { x: 16, y: 16 },
  handgrabbing: { x: 16, y: 16 },
  handopen: { x: 16, y: 16 },
  handpointing: { x: 12, y: 10 },
  help: { x: 7, y: 0 },
  makealias: { x: 7, y: 0 },
  move: { x: 16, y: 16 },
  notallowed: { x: 7, y: 0 },
  poof: { x: 7, y: 0 },
  resizenorth: { x: 16, y: 16 },
  resizenortheast: { x: 16, y: 16 },
  resizenortheastsouthwest: { x: 16, y: 16 },
  resizenorthsouth: { x: 16, y: 16 },
  resizenorthwest: { x: 16, y: 16 },
  resizenorthwestsoutheast: { x: 16, y: 16 },
  resizeright: { x: 16, y: 16 },
  resizesouth: { x: 16, y: 16 },
  resizesoutheast: { x: 16, y: 16 },
  resizesouthwest: { x: 16, y: 16 },
  resizeup: { x: 16, y: 16 },
  resizeupdown: { x: 16, y: 16 },
  resizewest: { x: 16, y: 16 },
  resizewesteast: { x: 16, y: 16 },
  screenshotselection: { x: 16, y: 16 },
  screenshotwindow: { x: 16, y: 16 },
  textcursor: { x: 16, y: 16 },
  textcursorvertical: { x: 16, y: 16 },
  zoomin: { x: 16, y: 16 },
  zoomout: { x: 16, y: 16 },
};


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

const getRippleStyleColor = (hex: string, alpha: number) => {
  if (hex.startsWith("#")) {
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
};

const emit = defineEmits<{
  (e: "update:isPlaying", value: boolean): void;
  (e: "update:currentTime", value: number): void;
  (e: "duration-change", value: number): void;
  (e: "update:zoom", value: ZoomElement): void;
  (e: 'select:transform-layer', layerId: string): void;
  (e: 'deselect:transform-layer'): void;
  (e: 'deselect:zoom'): void;
  (e: 'update:layer-transform', transform: NormalizedTransform): void;
  (e: 'update:layer-crop', crop: import('../composition/composition-types').NormalizedCrop): void;
  (e: 'select:base-video'): void;
  (e: 'select:canvas'): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const videoError = ref<string | null>(null);
const isVideoFrameReady = ref(false);

const logicalSize = ref({ width: 0, height: 0 });
const previewFrameStyle = computed(() => {
  const preview = outputPreviewRect(logicalSize.value.width, logicalSize.value.height, props.outputCanvas);
  return { left: `${preview.x}px`, top: `${preview.y}px`, width: `${preview.width}px`, height: `${preview.height}px` };
});
const deviceScale = ref(1);
const maxZoomScale = Math.max(...Object.values(ZOOM_DEPTH_SCALES));
let resizeObserver: ResizeObserver | null = null;
let animationFrameId: number | null = null;
let lastDrawTime = 0;
let previousCamera: { focusX: number; focusY: number; scale: number } | null =
  null;
let renderedCamera: { focusX: number; focusY: number; scale: number } | null =
  null;
let lastCameraUpdateMs = 0;
const cameraVelocity = createCameraVelocity();
const cursorFollowCamera = createCursorFollowCameraState();
const videoWindowBounds = ref<{
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  scale: number;
} | null>(null);
const isFormatTransitioning = ref(false);
let formatTransitionTimer: ReturnType<typeof setTimeout> | null = null;
const webcamHandleStyle = computed(() => {
  const bounds = videoWindowBounds.value; const layer = props.selectedTransformLayer;
  if (!bounds || !layer) return { display: 'none' };
  const transform = webcamDraft.value ?? layer.transform ?? { x: 0, y: 0, width: 1, height: 1 };
  if (layer.reactToZoom) {
    const layout = computeWebcamLayout(bounds.dw, bounds.dh, bounds.scale, webcamSettingsForAppearance(layer.appearance ?? layer.webcamAppearance), transform);
    return { left: `${bounds.dx + layout.x}px`, top: `${bounds.dy + layout.y}px`, width: `${layout.width}px`, height: `${layout.height}px` };
  }
  return { left: `${bounds.dx + transform.x * bounds.dw}px`, top: `${bounds.dy + transform.y * bounds.dh}px`, width: `${transform.width * bounds.dw}px`, height: `${transform.height * bounds.dh}px` };
});
const cropDraft = ref<import('../composition/composition-types').NormalizedCrop | null>(null);
const cropValue = computed(() => cropDraft.value ?? props.selectedTransformLayer?.crop ?? { x: 0, y: 0, width: 1, height: 1 });
const cropOverlayStyle = computed(() => {
  if (!props.isCropping || !props.selectedTransformLayer || !videoWindowBounds.value) return { display: 'none' };
  const bounds = videoWindowBounds.value;
  const transform = props.selectedTransformLayer.transform ?? { x: 0, y: 0, width: 1, height: 1 };
  const layout = props.selectedTransformLayer.reactToZoom
    ? computeWebcamLayout(bounds.dw, bounds.dh, bounds.scale, webcamSettingsForAppearance(props.selectedTransformLayer.appearance ?? props.selectedTransformLayer.webcamAppearance), transform)
    : { x: transform.x * bounds.dw, y: transform.y * bounds.dh, width: transform.width * bounds.dw, height: transform.height * bounds.dh };
  const crop = cropValue.value;
  return { left: `${bounds.dx + layout.x + crop.x * layout.width}px`, top: `${bounds.dy + layout.y + crop.y * layout.height}px`, width: `${crop.width * layout.width}px`, height: `${crop.height * layout.height}px` };
});
let cropDrag: { kind: 'move' | 'resize'; corner?: ResizeCorner; startX: number; startY: number; value: import('../composition/composition-types').NormalizedCrop } | null = null;
const cropBounds = () => {
  const style = cropOverlayStyle.value;
  return { width: Number.parseFloat(String(style.width)) || 1, height: Number.parseFloat(String(style.height)) || 1 };
};
const clampCrop = (value: import('../composition/composition-types').NormalizedCrop) => {
  const width = Math.min(1, Math.max(.05, value.width)); const height = Math.min(1, Math.max(.05, value.height));
  return { x: Math.min(1 - width, Math.max(0, value.x)), y: Math.min(1 - height, Math.max(0, value.y)), width, height };
};
const beginCropDrag = (event: PointerEvent, kind: 'move' | 'resize', corner?: ResizeCorner) => { cropDrag = { kind, corner, startX: event.clientX, startY: event.clientY, value: { ...cropValue.value } }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); };
const moveCropDrag = (event: PointerEvent) => {
  if (!cropDrag) return; const bounds = cropBounds(); const dx = (event.clientX - cropDrag.startX) / bounds.width * cropDrag.value.width; const dy = (event.clientY - cropDrag.startY) / bounds.height * cropDrag.value.height;
  if (cropDrag.kind === 'move') cropDraft.value = clampCrop({ ...cropDrag.value, x: cropDrag.value.x + dx, y: cropDrag.value.y + dy });
  else { const left = cropDrag.corner?.includes('left'); const top = cropDrag.corner?.includes('top'); const width = cropDrag.value.width + (left ? -dx : dx); const height = cropDrag.value.height + (top ? -dy : dy); cropDraft.value = clampCrop({ x: left ? cropDrag.value.x + cropDrag.value.width - width : cropDrag.value.x, y: top ? cropDrag.value.y + cropDrag.value.height - height : cropDrag.value.y, width, height }); }
};
const endCropDrag = (event: PointerEvent) => { if (cropDraft.value) emit('update:layer-crop', cropDraft.value); cropDraft.value = null; cropDrag = null; if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId); };
const webcamDraft = ref<NormalizedTransform | null>(null);
let webcamDrag: { kind: 'move' | 'resize'; corner?: ResizeCorner; startX: number; startY: number; lastX: number; lastY: number; transform: NormalizedTransform } | null = null;
const focusTargetStyle = computed(() => {
  const bounds = videoWindowBounds.value;
  if (
    !props.selectedZoom ||
    props.selectedZoom.mode !== "manual" ||
    props.isPlaying ||
    !bounds
  )
    return { display: "none" };
  const selectionScale = [1.25, 1.5, 1.8, 2.2, 3.5, 5][
    props.selectedZoom.depth - 1
  ];
  return {
    left: `${bounds.dx + props.selectedZoom.focus.cx * bounds.dw - bounds.dw / selectionScale / 2}px`,
    top: `${bounds.dy + props.selectedZoom.focus.cy * bounds.dh - bounds.dh / selectionScale / 2}px`,
    width: `${bounds.dw / selectionScale}px`,
    height: `${bounds.dh / selectionScale}px`,
  };
});
const isMovingSelection = ref(false);

interface Ripple {
  x: number;
  y: number;
  radius: number;
  alpha: number;
}
const ripples = ref<Ripple[]>([]);

const { getCursorImage } = useCursorReplacer();
const customCursorImage = ref<HTMLImageElement | null>(null);
const compositionImages = new Map<string, HTMLImageElement>();
const compositionVideos = new Map<string, HTMLVideoElement>();

const DEFAULT_CLIP_APPEARANCE: ClipAppearance = {
  cornerRadius: "sm",
  shadowSize: "md",
  shadowColor: "#000000",
  shadowDirection: "bottom",
};

const radiusForAppearance = (appearance: ClipAppearance | undefined) =>
  ({ none: 0, sm: 8, md: 16, lg: 24, full: Number.MAX_SAFE_INTEGER })[
    (appearance ?? DEFAULT_CLIP_APPEARANCE).cornerRadius
  ];

const applyClipShadow = (
  ctx: CanvasRenderingContext2D,
  appearance: ClipAppearance | undefined,
  width: number,
) => {
  const style = appearance ?? DEFAULT_CLIP_APPEARANCE;
  const blur = { none: 0, sm: 10, md: 20, lg: 32 }[style.shadowSize];
  const direction = style.shadowDirection;
  ctx.shadowColor = style.shadowColor;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = direction === "top-left" ? -width * 0.018 : direction === "bottom-right" ? width * 0.018 : 0;
  ctx.shadowOffsetY = direction === "top-left" ? -width * 0.018 : direction === "all" ? 0 : width * 0.018;
};

const disposeCompositionMedia = () => {
  compositionVideos.forEach((media) => {
    media.pause();
    media.removeAttribute("src");
    media.load();
  });
  compositionImages.clear();
  compositionVideos.clear();
};

const reconcileCompositionMedia = () => {
  const mediaById = new Map(props.composition.media.map((asset) => [asset.id, asset]));
  for (const [id, media] of compositionVideos) {
    const asset = mediaById.get(id);
    if (asset?.kind === "video" && asset.src === media.dataset.source) continue;
    media.pause(); media.removeAttribute("src"); media.load(); compositionVideos.delete(id);
  }
  for (const [id] of compositionImages) {
    const asset = mediaById.get(id);
    if (asset?.kind === "image") continue;
    compositionImages.delete(id);
  }
  for (const asset of props.composition.media) {
    if (asset.kind === "audio" || !asset.src) continue;
    if (asset.kind === "image") {
      if (!compositionImages.has(asset.id)) { const image = new Image(); image.src = asset.src; compositionImages.set(asset.id, image); }
      continue;
    }
    if (!compositionVideos.has(asset.id)) {
      const media = document.createElement("video");
      media.muted = true; media.playsInline = true; media.preload = "auto"; media.dataset.source = asset.src; media.src = asset.src; media.load(); compositionVideos.set(asset.id, media);
    }
  }
};

watch(
  () => props.composition.media.map((asset) => `${asset.id}:${asset.kind}:${asset.src}`).join("|"),
  reconcileCompositionMedia,
  { immediate: true },
);

const syncCompositionVideos = () => {
  const timeMs = props.currentTime * 1000;
  const active = new Set(
    activeLayersAt(props.composition, timeMs)
      .filter((layer) => layer.kind === "video")
      .map((layer) => layer.id),
  );
  for (const layer of props.composition.layers) {
    if (layer.kind !== "video") continue;
    const media = compositionVideos.get(layer.assetId);
    if (!media) continue;
    if (!active.has(layer.id)) {
      media.pause();
      continue;
    }
    const localTime = props.currentTime - layer.startMs / 1000 + (layer.sourceOffsetMs ?? 0) / 1000;
    if (localTime < 0 || (Number.isFinite(media.duration) && localTime >= media.duration)) continue;
    const drift = Math.abs(media.currentTime - localTime);
    if (!props.isPlaying) {
      media.pause();
      if (drift > 0.01) media.currentTime = localTime;
      continue;
    }
    if (drift > 0.04) media.currentTime = localTime;
    if (media.paused) void media.play().catch(() => undefined);
  }
};

watch(
  () => [props.currentTime, props.isPlaying, props.composition] as const,
  syncCompositionVideos,
  { flush: "post" },
);

watch(
  () => [
    props.selectedCursor,
    props.cursorSize,
    props.cursorColor,
    deviceScale.value,
  ],
  async () => {
    try {
      const rasterSize = props.cursorSize * maxZoomScale * deviceScale.value;
      const cursorType =
        props.selectedCursor === "automatic" ? "default" : props.selectedCursor;
      const img = await getCursorImage(
        cursorType,
        rasterSize,
        props.cursorColor,
      );
      customCursorImage.value = img;
    } catch (err) {
      console.error("Failed to load custom cursor image:", err);
      customCursorImage.value = null;
    }
  },
  { immediate: true },
);

const videoEl = document.createElement("video");
videoEl.muted = true;
videoEl.preload = "auto";
videoEl.playsInline = true;

const effectiveVideoSrc = computed(
  () => props.editorData?.videoSrc || props.videoSrc,
);

const handleVideoMetadata = () => {
  if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
    emit("duration-change", Math.ceil(videoEl.duration));
  }
};

const handleVideoFrameReady = () => {
  isVideoFrameReady.value = true;
  renderOnce();
};

const handleVideoError = () => {
  isVideoFrameReady.value = false;
  videoError.value = "Unable to load this video file.";
};

videoEl.addEventListener("loadedmetadata", handleVideoMetadata);
videoEl.addEventListener("loadeddata", handleVideoFrameReady);
videoEl.addEventListener("canplay", handleVideoFrameReady);
videoEl.addEventListener("error", handleVideoError);

const loadVideo = () => {
  videoError.value = null;
  isVideoFrameReady.value = false;
  previousCamera = null;
  renderedCamera = null;
  Object.assign(cameraVelocity, createCameraVelocity());
  videoEl.pause();
  videoEl.currentTime = 0;
  videoEl.src = effectiveVideoSrc.value ?? "";
  videoEl.load();
};
watch(effectiveVideoSrc, loadVideo, { immediate: true });
watch(() => `${props.outputCanvas.width}:${props.outputCanvas.height}:${props.outputCanvas.showBackground}`, () => {
  isFormatTransitioning.value = true;
  if (formatTransitionTimer) clearTimeout(formatTransitionTimer);
  formatTransitionTimer = setTimeout(() => { isFormatTransitioning.value = false; }, 260);
});
watch(() => props.selectedTransformLayer?.transform, () => {
  if (!webcamDrag) webcamDraft.value = null;
}, { deep: true });

watch(
  () => props.isPlaying,
  (playing) => {
    renderOnce();
    if (playing) {
      videoEl
        .play()
        .catch((error) =>
          console.error("Failed to play video element:", error),
        );
    } else {
      videoEl.pause();
      previousCamera = null;
      renderedCamera = null;
      Object.assign(cameraVelocity, createCameraVelocity());
    }
  },
);

watch(
  () => props.currentTime,
  (time) => {
    const clampedTime = Math.max(0, Math.min(videoEl.duration || 0, time));
    if (Math.abs(videoEl.currentTime - clampedTime) > 0.15)
      videoEl.currentTime = clampedTime;
  },
);

const backgroundVideo = document.createElement("video");
backgroundVideo.muted = true;
backgroundVideo.loop = true;
backgroundVideo.preload = "auto";
backgroundVideo.playsInline = true;

const bgImageCache = new Map<string, HTMLImageElement>();
const activeBgState = ref<BackgroundValue | null>(props.selectedBackground);
const prevBgState = ref<BackgroundValue | null>(null);
const activeBgImg = ref<HTMLImageElement | null>(null);
const prevBgImg = ref<HTMLImageElement | null>(null);

let transitionStartTime = 0;
const TRANSITION_DURATION = 180; // 180ms smooth canvas cross-fade
const isTransitioningBackground = ref(false);

const triggerBgTransition = () => {
  transitionStartTime = performance.now();
  isTransitioningBackground.value = true;
  renderOnce();
};

const loadBackground = () => {
  const nextBg = props.selectedBackground;
  const t0 = performance.now();

  if (!nextBg) {
    console.log(`[EditorCanvas] 🎯 Background reset to NULL at ${t0.toFixed(1)}ms`);
    prevBgState.value = activeBgState.value;
    prevBgImg.value = activeBgImg.value;
    activeBgState.value = null;
    activeBgImg.value = null;
    triggerBgTransition();
    return;
  }

  if (activeBgState.value?.id === nextBg.id) return;

  console.log(`[EditorCanvas] 🎯 Background selection received: ${nextBg.kind} (${nextBg.name || nextBg.id}) at ${t0.toFixed(1)}ms`);

  prevBgState.value = activeBgState.value;
  prevBgImg.value = activeBgImg.value;
  activeBgState.value = nextBg;

  if (nextBg.kind === "image") {
    let cached = bgImageCache.get(nextBg.path);
    if (!cached) {
      cached = new Image();
      cached.decoding = "async";
      cached.onload = () => {
        console.log(`[EditorCanvas] 🖼️ Image loaded & cached: ${nextBg.name || nextBg.id} in ${(performance.now() - t0).toFixed(1)}ms`);
        renderOnce();
      };
      cached.src = nextBg.path;
      bgImageCache.set(nextBg.path, cached);
    }
    activeBgImg.value = cached;
    triggerBgTransition();
  } else if (nextBg.kind === "video") {
    backgroundVideo.src = nextBg.path;
    backgroundVideo.load();
    activeBgImg.value = null;
    triggerBgTransition();
  } else {
    activeBgImg.value = null;
    triggerBgTransition();
  }
};
watch(() => props.selectedBackground, loadBackground, { immediate: true, deep: true });
watch(() => props.backgroundBlurPercent, renderOnce);

const drawSingleBackground = (
  ctx: CanvasRenderingContext2D,
  bg: BackgroundValue | null,
  imgSource: HTMLImageElement | null,
  rect: { x: number; y: number; width: number; height: number },
  alpha: number
) => {
  if (!bg || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, alpha));

  if (bg.kind === "color") {
    ctx.fillStyle = bg.color;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  } else if (bg.kind === "gradient") {
    const gradient = bg.gradient.type === 'radial'
      ? ctx.createRadialGradient(rect.x + rect.width / 2, rect.y + rect.height / 2, 0, rect.x + rect.width / 2, rect.y + rect.height / 2, Math.max(rect.width, rect.height) / 2)
      : (() => {
          const radians = (bg.gradient.angle - 90) * Math.PI / 180;
          const dx = Math.cos(radians) * rect.width / 2;
          const dy = Math.sin(radians) * rect.height / 2;
          return ctx.createLinearGradient(rect.x + rect.width / 2 - dx, rect.y + rect.height / 2 - dy, rect.x + rect.width / 2 + dx, rect.y + rect.height / 2 + dy);
        })();
    for (const stop of bg.gradient.stops) {
      gradient.addColorStop(stop.position, `${stop.color}${Math.round(stop.alpha * 255).toString(16).padStart(2, '0')}`);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  } else {
    const source = bg.kind === "video" && backgroundVideo.readyState >= 2
      ? backgroundVideo
      : bg.kind === "image" && imgSource && imgSource.naturalWidth > 0
      ? imgSource
      : null;

    if (source) {
      const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
      const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
      const crop = coverSourceRect(sourceWidth, sourceHeight, rect.width, rect.height);
      const blur = Math.min(48, Math.max(0, (props.backgroundBlurPercent ?? 0) * 0.48));
      if (blur > 0) {
        const overscan = blur * 2;
        ctx.filter = `blur(${blur}px)`;
        ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, rect.x - overscan, rect.y - overscan, rect.width + overscan * 2, rect.height + overscan * 2);
      } else {
        ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, rect.x, rect.y, rect.width, rect.height);
      }
    } else {
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-bg-surface').trim() || '#f7f5f0';
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
  }

  ctx.restore();
};

const drawBackground = (
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
) => {
  let progress = 1;
  if (isTransitioningBackground.value) {
    const elapsed = performance.now() - transitionStartTime;
    progress = Math.min(1, elapsed / TRANSITION_DURATION);
    if (progress >= 1) {
      isTransitioningBackground.value = false;
      prevBgState.value = null;
      prevBgImg.value = null;
    }
  }

  if (progress < 1 && prevBgState.value) {
    drawSingleBackground(ctx, prevBgState.value, prevBgImg.value, rect, 1.0);
    drawSingleBackground(ctx, activeBgState.value, activeBgImg.value, rect, progress);
  } else {
    drawSingleBackground(ctx, activeBgState.value, activeBgImg.value, rect, 1.0);
  }
};

watch(
  () => props.isPlaying,
  (playing) => {
    if (playing && props.selectedBackground?.kind === "video") {
      backgroundVideo
        .play()
        .catch((error) =>
          console.error("Failed to play background video:", error),
        );
    } else {
      backgroundVideo.pause();
    }
  },
);

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

  // Redraw synchronously to prevent blinking/flashing on resize
  renderCanvas();
};

const drawVideoWindow = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) => {
  const preview = outputPreviewRect(width, height, props.outputCanvas);
  if (!props.isVideoEnabled) {
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.fillRect(preview.x, preview.y, preview.width, preview.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Video track disabled", preview.x + preview.width / 2, preview.y + preview.height / 2);
    return null;
  }

  const videoWidth = videoEl.videoWidth || 1920;
  const videoHeight = videoEl.videoHeight || 1080;
  const { x: dx, y: dy, width: dw, height: dh } = preview;
  const source = props.outputCanvas.showBackground ? { x: 0, y: 0, width: videoWidth, height: videoHeight } : coverSourceRect(videoWidth, videoHeight, dw, dh);
  const media = props.outputCanvas.showBackground ? framedMediaRect(videoWidth, videoHeight, dw, dh) : { x: 0, y: 0, width: dw, height: dh };

  ctx.save();
  // The recorded screen is the global canvas content, not an overlay clip.
  // It must not acquire a second frame/shadow while zooming.
  ctx.beginPath();
  ctx.roundRect(dx, dy, dw, dh, 16);
  ctx.clip();

  const zoom = zoomAtTime(
    props.zoomElements,
    props.currentTime * 1000,
    props.editorData?.cursor.telemetry ?? [],
  );
  // The camera follows the same interpolated event stream as the visible cursor.
  // Telemetry is used for zoom suggestions, not presentation, so sparse samples
  // cannot make the camera and the cursor disagree.
  const renderedCursor = cursorStateAt(
    props.editorData?.cursor.events ?? [],
    props.currentTime,
  );
  const sourceFocus =
    zoom?.mode === "auto"
      ? updateCursorFollowCamera(
          cursorFollowCamera,
          renderedCursor
            ? { cx: renderedCursor.x, cy: renderedCursor.y }
            : null,
          zoom.focus,
          zoom.scale,
          zoom.strength,
          props.currentTime * 1000,
        )
      : (zoom?.focus ?? { cx: 0.5, cy: 0.5 });
  const scale = zoom?.scale ?? 1;
  const trackedFocus = zoom?.mode === "auto" ? outputPoint(sourceFocus.cx, sourceFocus.cy, videoWidth, videoHeight, dw, dh, props.outputCanvas.showBackground) : sourceFocus;
  const cameraFocus = clampFocusToScale(trackedFocus, scale);
  const focusX = dx + cameraFocus.cx * dw;
  const focusY = dy + cameraFocus.cy * dh;
  const drawAtCamera = (
    camera: { focusX: number; focusY: number; scale: number },
    alpha: number,
  ) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(dx + dw / 2, dy + dh / 2);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.focusX, -camera.focusY);
    if (videoEl.readyState >= 1) {
      if (props.outputCanvas.showBackground) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, .35)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
        ctx.beginPath(); ctx.roundRect(dx + media.x, dy + media.y, media.width, media.height, 16); ctx.fillStyle = 'rgba(0, 0, 0, .01)'; ctx.fill();
        ctx.clip();
        ctx.drawImage(videoEl, source.x, source.y, source.width, source.height, dx + media.x, dy + media.y, media.width, media.height);
        ctx.restore();
      } else ctx.drawImage(videoEl, source.x, source.y, source.width, source.height, dx + media.x, dy + media.y, media.width, media.height);
    }
    ctx.restore();
  };

  const targetCamera = { focusX, focusY, scale };
  const now = performance.now();
  const deltaMs = Math.min(80, Math.max(1, now - lastCameraUpdateMs));
  lastCameraUpdateMs = now;
  if (!props.isPlaying || !renderedCamera) {
    renderedCamera = targetCamera;
  } else {
    renderedCamera = stepCameraSpring(
      renderedCamera,
      targetCamera,
      cameraVelocity,
      deltaMs,
    );
  }
  const camera = renderedCamera;
  ctx.save();
  ctx.translate(dx + dw / 2, dy + dh / 2);
  ctx.scale(camera.scale, camera.scale);
  ctx.translate(-camera.focusX, -camera.focusY);
  drawBackground(ctx, { x: dx, y: dy, width: dw, height: dh });
  ctx.restore();
  const previous = previousCamera;
  const cameraDistance = previous
    ? Math.hypot(focusX - previous.focusX, focusY - previous.focusY) +
      Math.abs(scale - previous.scale) * Math.max(dw, dh)
    : 0;
  if (
    props.isPlaying &&
    previous &&
    cameraDistance > 0.5 &&
    videoEl.readyState >= 1
  ) {
    for (let sample = 1; sample <= 3; sample += 1) {
      const progress = sample / 4;
      drawAtCamera(
        {
          focusX: previous.focusX + (focusX - previous.focusX) * progress,
          focusY: previous.focusY + (focusY - previous.focusY) * progress,
          scale: previous.scale + (scale - previous.scale) * progress,
        },
        0.09,
      );
    }
  }

  if (videoError.value) {
    ctx.save();
    ctx.translate(dx + dw / 2, dy + dh / 2);
    ctx.scale(scale, scale);
    ctx.translate(-focusX, -focusY);
    ctx.fillStyle = "#ef4444";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(videoError.value, focusX, focusY);
    ctx.restore();
  } else if (videoEl.readyState >= 1) {
    drawAtCamera(camera, 1);
  } else {
    ctx.save();
    ctx.translate(dx + dw / 2, dy + dh / 2);
    ctx.scale(scale, scale);
    ctx.translate(-focusX, -focusY);
    ctx.fillStyle = "#334155";
    ctx.fillRect(dx, dy, dw, dh);
    ctx.fillStyle = "#ffffff";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Loading video recording...", width / 2, height / 2);
    ctx.restore();
  }
  ctx.restore();
  previousCamera = camera;
  videoWindowBounds.value = {
    dx: props.outputCanvas.showBackground ? dx + media.x : dx,
    dy: props.outputCanvas.showBackground ? dy + media.y : dy,
    dw: props.outputCanvas.showBackground ? media.width : dw,
    dh: props.outputCanvas.showBackground ? media.height : dh,
    scale: camera.scale,
  };
  // Cursor, ripples and video must share the rendered spring state. Returning
  // the target camera here made overlays jump ahead of the eased video frame.
  return {
    dx,
    dy,
    dw,
    dh,
    focusX: camera.focusX,
    focusY: camera.focusY,
    scale: camera.scale,
  };
};

const drawInCameraSpace = (
  ctx: CanvasRenderingContext2D,
  videoWindow: {
    dx: number;
    dy: number;
    dw: number;
    dh: number;
    focusX: number;
    focusY: number;
    scale: number;
  },
  drawContent: () => void,
) => {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(
    videoWindow.dx,
    videoWindow.dy,
    videoWindow.dw,
    videoWindow.dh,
    0,
  );
  ctx.clip();
  ctx.translate(
    videoWindow.dx + videoWindow.dw / 2,
    videoWindow.dy + videoWindow.dh / 2,
  );
  ctx.scale(videoWindow.scale, videoWindow.scale);
  ctx.translate(-videoWindow.focusX, -videoWindow.focusY);
  drawContent();
  ctx.restore();
};

const updateSelectedFocus = (event: PointerEvent) => {
  const canvas = canvasRef.value;
  const bounds = videoWindowBounds.value;
  if (
    !canvas ||
    !bounds ||
    !props.selectedZoom ||
    props.selectedZoom.mode !== "manual"
  )
    return;
  const rect = canvas.getBoundingClientRect();
  const cx = Math.min(
    1,
    Math.max(0, (event.clientX - rect.left - bounds.dx) / bounds.dw),
  );
  const cy = Math.min(
    1,
    Math.max(0, (event.clientY - rect.top - bounds.dy) / bounds.dh),
  );
  emit("update:zoom", { ...props.selectedZoom, focus: { cx, cy } });
};

const beginSelectionMove = (event: PointerEvent) => {
  if (selectWebcamAt(event)) return;
  const canvas = canvasRef.value;
  const bounds = videoWindowBounds.value;
  if (canvas && bounds) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x >= bounds.dx && x <= bounds.dx + bounds.dw && y >= bounds.dy && y <= bounds.dy + bounds.dh) {
      emit('select:base-video');
      return;
    }
    emit('select:canvas');
    return;
  }
  if (props.selectedTransformLayer) emit('deselect:transform-layer');
  if (props.selectedZoom && props.activeTab !== 'zoom') emit('deselect:zoom');
  if (props.selectedZoom?.mode !== "manual") return;
  isMovingSelection.value = true;
  canvasRef.value?.setPointerCapture(event.pointerId);
  updateSelectedFocus(event);
};

const selectWebcamAt = (event: PointerEvent) => {
  const canvas = canvasRef.value; const bounds = videoWindowBounds.value;
  if (!canvas || !bounds) return false;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left - bounds.dx; const y = event.clientY - rect.top - bounds.dy;
  const layers = activeLayersAt(props.composition, props.currentTime * 1000).filter((layer): layer is MediaCompositionLayer => layer.kind !== 'audio' && layer.kind !== 'caption' && Boolean(layer.transform));
  for (const layer of [...layers].reverse()) {
    const layout = layer.reactToZoom
      ? computeWebcamLayout(bounds.dw, bounds.dh, bounds.scale, webcamSettingsForAppearance(layer.appearance ?? layer.webcamAppearance), layer.transform)
      : { x: layer.transform!.x * bounds.dw, y: layer.transform!.y * bounds.dh, width: layer.transform!.width * bounds.dw, height: layer.transform!.height * bounds.dh };
    
    if (x >= layout.x && x <= layout.x + layout.width && y >= layout.y && y <= layout.y + layout.height) { emit('select:transform-layer', layer.id); return true; }
  }
  return false;
};

const moveSelection = (event: PointerEvent) => {
  if (isMovingSelection.value) updateSelectedFocus(event);
};

const endSelectionMove = (event: PointerEvent) => {
  isMovingSelection.value = false;
  if (canvasRef.value?.hasPointerCapture(event.pointerId)) {
    canvasRef.value.releasePointerCapture(event.pointerId);
  }
};

const beginWebcamDrag = (event: PointerEvent, kind: 'move' | 'resize', corner?: ResizeCorner) => {
  const layer = props.selectedTransformLayer;
  if (!layer?.transform) return;
  event.stopPropagation();
  webcamDraft.value = { ...layer.transform };
  webcamDrag = { kind, corner, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, transform: { ...layer.transform } };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
};
const applyWebcamDrag = (clientX: number, clientY: number, shiftKey: boolean) => {
  const bounds = videoWindowBounds.value;
  if (!webcamDrag || !bounds) return;
  webcamDrag.lastX = clientX; webcamDrag.lastY = clientY;
  const dx = (clientX - webcamDrag.startX) / bounds.dw;
  const dy = (clientY - webcamDrag.startY) / bounds.dh;
  const initial = webcamDrag.transform;
  if (webcamDrag.kind === 'move') {
    webcamDraft.value = { ...initial, x: Math.min(1 - initial.width, Math.max(0, initial.x + dx)), y: Math.min(1 - initial.height, Math.max(0, initial.y + dy)) };
    return;
  }
  const left = webcamDrag.corner?.includes('left'); const top = webcamDrag.corner?.includes('top');
  const rawWidth = initial.width + (left ? -dx : dx);
  const rawHeight = initial.height + (top ? -dy : dy);
  const ratio = initial.height / initial.width;
  const width = Math.min(.9, Math.max(.08, rawWidth));
  const height = Math.min(.9, Math.max(.08, shiftKey ? rawHeight : width * ratio));
  webcamDraft.value = { x: Math.min(1 - width, Math.max(0, left ? initial.x + initial.width - width : initial.x)), y: Math.min(1 - height, Math.max(0, top ? initial.y + initial.height - height : initial.y)), width, height };
};
const moveWebcamDrag = (event: PointerEvent) => applyWebcamDrag(event.clientX, event.clientY, event.shiftKey);
const updateWebcamAspectMode = (event: KeyboardEvent) => {
  if (event.key === 'Shift' && webcamDrag) applyWebcamDrag(webcamDrag.lastX, webcamDrag.lastY, event.type === 'keydown');
};
const endWebcamDrag = (event: PointerEvent) => {
  if (!webcamDrag) return;
  if (webcamDraft.value) emit('update:layer-transform', webcamDraft.value);
  webcamDrag = null;
  if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
};

const drawCursorWarning = (
  ctx: CanvasRenderingContext2D,
  message: string,
  width: number,
) => {
  ctx.save();
  ctx.font = "11px sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
  const padding = 8;
  const textWidth = ctx.measureText(message).width;
  ctx.roundRect(
    width - textWidth - padding * 2 - 8,
    12,
    textWidth + padding * 2,
    26,
    6,
  );
  ctx.fill();
  ctx.fillStyle = "#fbbf24";
  ctx.fillText(message, width - 8 - padding, 29);
  ctx.restore();
};

const drawComposition = (
  ctx: CanvasRenderingContext2D,
  videoWindow: NonNullable<ReturnType<typeof drawVideoWindow>>,
  followsZoom: boolean,
) => {
  const timeMs = props.currentTime * 1000;
  for (const layer of activeLayersAt(props.composition, timeMs)) {
    if (
      layer.kind === "audio" ||
      (layer.kind === 'video' && layer.reactToZoom) ||
      (followsZoom ? layer.kind === 'video' : layer.kind !== 'video')
    ) continue;
    if (layer.kind === "caption") {
      const sentence = layer.caption.sentences.find(
        (item) => item.startMs <= timeMs && timeMs <= item.endMs,
      );
      if (!sentence?.text) continue;
      const style = layer.caption.style;
      ctx.save();
      ctx.font = `${Math.max(12, (style.fontSize * videoWindow.dw) / Math.max(1, videoEl.videoWidth || 1920))}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = style.color;
      ctx.shadowColor = style.shadowColor;
      ctx.shadowBlur = style.shadowBlur;
      const y =
        style.placement === "top"
          ? 0.12
          : style.placement === "center"
            ? 0.5
            : 0.88;
      ctx.fillText(
        sentence.text,
        videoWindow.dx + videoWindow.dw / 2,
        videoWindow.dy + videoWindow.dh * y,
        videoWindow.dw * 0.9,
      );
      ctx.restore();
      continue;
    }
    const asset =
      layer.kind === "image"
        ? compositionImages.get(layer.assetId)
        : compositionVideos.get(layer.assetId);
    if (!asset) continue;
    const transform = layer.id === props.selectedTransformLayer?.id && webcamDraft.value
      ? webcamDraft.value
      : layer.transform ?? { x: 0, y: 0, width: 1, height: 1 };
    if (
      asset instanceof HTMLVideoElement &&
      asset.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    )
      continue;
    if (
      asset instanceof HTMLImageElement &&
      (!asset.complete || !asset.naturalWidth)
    )
      continue;
    const dx = videoWindow.dx + transform.x * videoWindow.dw;
    const dy = videoWindow.dy + transform.y * videoWindow.dh;
    const dw = transform.width * videoWindow.dw;
    const dh = transform.height * videoWindow.dh;
    const appearance = layer.appearance;
    ctx.save();
    applyClipShadow(ctx, appearance, dw);
    ctx.fillStyle = "rgba(0, 0, 0, 0.01)";
    ctx.beginPath();
    ctx.roundRect(dx, dy, dw, dh, Math.min(radiusForAppearance(appearance), dw / 2, dh / 2));
    ctx.fill();
    ctx.clip();
    const sourceWidth = asset instanceof HTMLVideoElement ? asset.videoWidth : asset.naturalWidth;
    const sourceHeight = asset instanceof HTMLVideoElement ? asset.videoHeight : asset.naturalHeight;
    if (layer.crop && sourceWidth > 0 && sourceHeight > 0) ctx.drawImage(asset, layer.crop.x * sourceWidth, layer.crop.y * sourceHeight, layer.crop.width * sourceWidth, layer.crop.height * sourceHeight, dx, dy, dw, dh);
    else ctx.drawImage(asset, dx, dy, dw, dh);
    ctx.restore();
  }
};

const drawWebcamLayers = (
  ctx: CanvasRenderingContext2D,
  videoWindow: NonNullable<ReturnType<typeof drawVideoWindow>>,
) => {
  const timeMs = props.currentTime * 1000;
  for (const layer of activeLayersAt(props.composition, timeMs)) {
    if (layer.kind !== "video" || !layer.reactToZoom) continue;
    const asset = compositionVideos.get(layer.assetId);
    const localTime =
      props.currentTime -
      layer.startMs / 1000 +
      (layer.sourceOffsetMs ?? 0) / 1000;
    if (
      !asset ||
      localTime < 0 ||
      (Number.isFinite(asset.duration) && localTime >= asset.duration) ||
      asset.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    )
      continue;
    ctx.save();
    ctx.translate(videoWindow.dx, videoWindow.dy);
    drawWebcamOverlay(
      ctx,
      asset,
      videoWindow.dw,
      videoWindow.dh,
      videoWindow.scale,
      webcamSettingsForAppearance(layer.appearance ?? layer.webcamAppearance),
      layer.id === props.selectedTransformLayer?.id && webcamDraft.value
        ? webcamDraft.value
        : layer.transform,
      layer.crop,
    );
    ctx.restore();
  }
};

const renderCanvas = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = logicalSize.value;
  if (!width || !height) {
    return;
  }
  ctx.setTransform(deviceScale.value, 0, 0, deviceScale.value, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, width, height);

  const videoWindow = drawVideoWindow(ctx, width, height);
  if (videoWindow) drawInCameraSpace(ctx, videoWindow, () => drawComposition(ctx, videoWindow, true));
  const cursorData = props.editorData?.cursor;
  if (videoWindow && cursorData?.available) {
    const time = props.currentTime;
    if (props.enableRipple && props.isPlaying && time >= lastDrawTime) {
      for (const button of buttonEventsBetween(
        cursorData.events,
        lastDrawTime,
        time,
      )) {
        const state = cursorStateAt(
          cursorData.events,
          button.sessionNs / 1_000_000_000,
        );
        if (!state) continue;
        const point = outputPoint(state.x, state.y, videoEl.videoWidth || 1920, videoEl.videoHeight || 1080, videoWindow.dw, videoWindow.dh, props.outputCanvas.showBackground);
        ripples.value.push({
          x: videoWindow.dx + point.cx * videoWindow.dw,
          y: videoWindow.dy + point.cy * videoWindow.dh,
          radius: 2,
          alpha: 1,
        });
      }
    }
    lastDrawTime = time;

    const state = cursorStateAt(cursorData.events, props.currentTime);
    drawInCameraSpace(ctx, videoWindow, () => {
      for (const ripple of ripples.value) {
        ctx.strokeStyle = getRippleStyleColor(props.rippleColor, ripple.alpha);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
        ctx.stroke();
        if (props.isPlaying) {
          ripple.radius += props.rippleSize / 25;
          ripple.alpha -= 0.04;
        }
      }
    });

    const activeImage = customCursorImage.value;
    if (
      state?.visible &&
      activeImage &&
      activeImage.complete &&
      activeImage.naturalWidth > 0
    ) {
      const point = outputPoint(state.x, state.y, videoEl.videoWidth || 1920, videoEl.videoHeight || 1080, videoWindow.dw, videoWindow.dh, props.outputCanvas.showBackground);
      const pointerX = videoWindow.dx + point.cx * videoWindow.dw;
      const pointerY = videoWindow.dy + point.cy * videoWindow.dh;

      // Draw cursor vector image in unscaled canvas coordinate space
      const targetSize = props.cursorSize;
      const scale = videoWindow.scale;
      const screenX =
        videoWindow.dx +
        videoWindow.dw / 2 +
        (pointerX - videoWindow.focusX) * scale;
      const screenY =
        videoWindow.dy +
        videoWindow.dh / 2 +
        (pointerY - videoWindow.focusY) * scale;
      const renderSize = targetSize * scale;

      let hxScreen = 0;
      let hyScreen = 0;

      const cursorType =
        props.selectedCursor === "automatic" ? "default" : props.selectedCursor;
      const hotspot = cursorHotspots[cursorType];
      const cursorScale = renderSize / 32;
      hxScreen = hotspot.x * cursorScale;
      hyScreen = hotspot.y * cursorScale;

      ctx.save();
      if (props.enableShadow) {
        ctx.shadowColor = props.shadowColor;
        ctx.shadowBlur = props.shadowBlur * scale;
        ctx.shadowOffsetX = Math.round(props.shadowBlur * 0.33 * scale);
        ctx.shadowOffsetY = Math.round(props.shadowBlur * 0.5 * scale);
      }

      const drawWidth = renderSize;
      const drawHeight = renderSize;

      ctx.drawImage(
        activeImage,
        screenX - hxScreen,
        screenY - hyScreen,
        drawWidth,
        drawHeight,
      );
      ctx.restore();
    }
    ripples.value = ripples.value.filter((ripple) => ripple.alpha > 0);
  } else if (props.isVideoEnabled && cursorData && !cursorData.available) {
    drawCursorWarning(ctx, "Cursor data missing", width);
  }
  if (videoWindow) drawWebcamLayers(ctx, videoWindow);
  if (videoWindow) drawComposition(ctx, videoWindow, false);

  if (props.isPlaying && videoEl.readyState >= 1) {
    emit("update:currentTime", videoEl.ended ? 0 : videoEl.currentTime);
  }
};

function draw() {
  renderCanvas();
  animationFrameId = null;
  if (props.isPlaying || props.selectedBackground?.kind === "video" || isTransitioningBackground.value) animationFrameId = requestAnimationFrame(draw);
}
function renderOnce() { if (animationFrameId === null) animationFrameId = requestAnimationFrame(draw); }

onMounted(() => {
  resizeCanvas();
  resizeObserver = new ResizeObserver(resizeCanvas);
  if (containerRef.value) resizeObserver.observe(containerRef.value);
  window.addEventListener('keydown', updateWebcamAspectMode);
  window.addEventListener('keyup', updateWebcamAspectMode);
  renderOnce();
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  videoEl.pause();
  backgroundVideo.pause();
  videoEl.removeEventListener("loadedmetadata", handleVideoMetadata);
  videoEl.removeEventListener("loadeddata", handleVideoFrameReady);
  videoEl.removeEventListener("canplay", handleVideoFrameReady);
  videoEl.removeEventListener("error", handleVideoError);
  videoEl.src = "";
  videoEl.load();
  backgroundVideo.removeAttribute("src");
  backgroundVideo.load();
  disposeCompositionMedia();
  window.removeEventListener('keydown', updateWebcamAspectMode);
  window.removeEventListener('keyup', updateWebcamAspectMode);
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
      @pointerdown="beginSelectionMove"
      @pointermove="moveSelection"
      @pointerup="endSelectionMove"
      @pointercancel="endSelectionMove"
    ></canvas>
    <Skeleton
      v-if="!isVideoFrameReady && !videoError"
      class="canvas-loading-skeleton"
      width="100%"
      height="100%"
      radius="var(--radius-lg)"
      aria-label="Video preview loading"
    />
    <div v-if="selectedTransformLayer" class="webcam-selection" :style="webcamHandleStyle" @pointerdown="beginWebcamDrag($event, 'move')" @pointermove="moveWebcamDrag" @pointerup="endWebcamDrag" @pointercancel="endWebcamDrag">
      <ResizeHandle @resize-start="(corner, event) => beginWebcamDrag(event, 'resize', corner)" @resize-move="(_corner, event) => moveWebcamDrag(event)" @resize-end="(_corner, event) => endWebcamDrag(event)" />
    </div>
    <div
      class="zoom-selection-box"
      :class="{ locked: selectedZoom?.mode !== 'manual' }"
      :style="focusTargetStyle"
      aria-hidden="true"
    ></div>

    <div v-if="isCropping && selectedTransformLayer" class="crop-overlay-box" :style="cropOverlayStyle" @pointerdown="beginCropDrag($event, 'move')" @pointermove="moveCropDrag" @pointerup="endCropDrag" @pointercancel="endCropDrag">
      <div class="crop-grid">
        <div class="grid-line vertical line-1"></div>
        <div class="grid-line vertical line-2"></div>
        <div class="grid-line horizontal line-1"></div>
        <div class="grid-line horizontal line-2"></div>
      </div>
      <ResizeHandle @resize-start="(corner, event) => beginCropDrag(event, 'resize', corner)" @resize-move="(_corner, event) => moveCropDrag(event)" @resize-end="(_corner, event) => endCropDrag(event)" />
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
.editor-canvas.is-format-transitioning { animation: output-reframe 180ms ease-out; }
@keyframes output-reframe { from { opacity: .88; transform: scale(.995); } to { opacity: 1; transform: scale(1); } }
.webcam-selection { position: absolute; border: 2px solid var(--color-primary); box-sizing: border-box; cursor: move; z-index: 2; }

.zoom-selection-box {
  position: absolute;
  border: 2px solid var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  pointer-events: none;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.5),
    inset 0 0 0 1px rgba(255, 255, 255, 0.35);
}

.zoom-selection-box.locked {
  border-style: dashed;
  opacity: 0.7;
}

.crop-overlay-box {
  position: absolute;
  border: 2px solid var(--color-primary);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
  box-sizing: border-box;
  z-index: 10;
  pointer-events: auto;
}

.crop-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.grid-line {
  position: absolute;
  background: rgba(255, 255, 255, 0.4);
}

.grid-line.vertical {
  top: 0;
  bottom: 0;
  width: 1px;
}

.grid-line.vertical.line-1 {
  left: 33.333%;
}

.grid-line.vertical.line-2 {
  left: 66.666%;
}

.grid-line.horizontal {
  left: 0;
  right: 0;
  height: 1px;
}

.grid-line.horizontal.line-1 {
  top: 33.333%;
}

.grid-line.horizontal.line-2 {
  top: 66.666%;
}

/* Floating Toolbars inside Canvas */
.canvas-top-toolbar {
  position: absolute;
  transform: translateX(-50%);
  z-index: 15;
  pointer-events: auto;
  display: flex;
  align-items: center;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  padding: 4px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.canvas-bottom-toolbar {
  position: absolute;
  transform: translateX(-50%);
  z-index: 15;
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  padding: 4px 8px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.canvas-tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--fast) ease;
}

.canvas-tool-btn:hover,
.canvas-tool-btn.is-open,
.canvas-tool-btn.active {
  background: var(--color-bg-surface-hover);
  border-color: var(--color-border-strong);
}

.canvas-tool-btn.active {
  background: var(--color-primary-light, rgba(255, 90, 31, 0.15));
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn-icon {
  width: 14px;
  height: 14px;
}

.btn-chevron {
  width: 12px;
  height: 12px;
  color: var(--text-muted);
  transition: transform var(--fast) ease;
}

.btn-chevron.is-flipped {
  transform: rotate(180deg);
}

.toolbar-divider {
  width: 1px;
  height: 16px;
  background-color: var(--color-border);
}

.preset-menu-content,
.add-menu-content {
  display: flex;
  flex-direction: column;
  padding: 4px;
  min-width: 120px;
  background: var(--color-bg-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--color-border);
}

.preset-menu-item,
.add-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background-color var(--fast) ease;
}

.preset-menu-item:hover,
.add-menu-item:hover {
  background: var(--color-bg-surface-hover);
}

.preset-menu-item.active {
  background: var(--color-primary-light, rgba(255, 90, 31, 0.15));
  color: var(--color-primary);
  font-weight: 700;
}
</style>
