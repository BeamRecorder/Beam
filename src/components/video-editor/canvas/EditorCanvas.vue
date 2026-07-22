<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from "vue";
import type { ProjectEditorData } from "../../../api/types/capture-api";
import type { CursorType } from "../composables/useCursorReplacer";
import type { BackgroundMedia } from "../composables/backgroundMedia";
import {
  buttonEventsBetween,
  cursorStateAt,
} from "../composables/cursorPlayback";
import { zoomAtTime } from "../zoom/zoom-playback";
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
  selectedBackground: BackgroundMedia | null;
  videoSrc: string;
  editorData?: ProjectEditorData | null;
  zoomElements: ZoomElement[];
  selectedZoom: ZoomElement | null;
  composition: ProjectComposition;
  loopProgress?: number;
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
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const videoError = ref<string | null>(null);

const logicalSize = ref({ width: 0, height: 0 });
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
} | null>(null);
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
    if (!props.isPlaying || drift > 0.4) media.currentTime = localTime;
    if (props.isPlaying && media.paused) void media.play().catch(() => undefined);
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

const handleVideoError = () => {
  videoError.value = "Unable to load this video file.";
};

videoEl.addEventListener("loadedmetadata", handleVideoMetadata);
videoEl.addEventListener("error", handleVideoError);

const loadVideo = () => {
  videoError.value = null;
  previousCamera = null;
  renderedCamera = null;
  Object.assign(cameraVelocity, createCameraVelocity());
  videoEl.pause();
  videoEl.currentTime = 0;
  videoEl.src = effectiveVideoSrc.value;
  videoEl.load();
};
watch(effectiveVideoSrc, loadVideo, { immediate: true });

watch(
  () => props.isPlaying,
  (playing) => {
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

const backgroundImg = new Image();
const backgroundVideo = document.createElement("video");
backgroundVideo.muted = true;
backgroundVideo.loop = true;
backgroundVideo.preload = "auto";
backgroundVideo.playsInline = true;

const loadBackground = () => {
  backgroundVideo.pause();
  backgroundVideo.removeAttribute("src");
  backgroundVideo.load();
  backgroundImg.removeAttribute("src");

  const background = props.selectedBackground;
  if (!background) return;

  if (background.kind === "video") {
    backgroundVideo.src = background.path;
    backgroundVideo.load();
  } else {
    backgroundImg.src = background.path;
  }
};
watch(() => props.selectedBackground, loadBackground, { immediate: true });

const drawBackground = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) => {
  const background = props.selectedBackground;
  if (background?.kind === "video" && backgroundVideo.readyState >= 2) {
    ctx.drawImage(backgroundVideo, 0, 0, width, height);
    return;
  }
  if (
    background?.kind !== "video" &&
    backgroundImg.complete &&
    backgroundImg.naturalWidth > 0
  ) {
    ctx.drawImage(backgroundImg, 0, 0, width, height);
    return;
  }

  ctx.fillStyle = "#1e1e24";
  ctx.fillRect(0, 0, width, height);
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
  if (!props.isVideoEnabled) {
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Video track disabled", width / 2, height / 2);
    return null;
  }

  const margin = 50;
  const availWidth = Math.max(1, width - margin * 2);
  const availHeight = Math.max(1, height - margin * 2);
  const videoWidth = videoEl.videoWidth || 1920;
  const videoHeight = videoEl.videoHeight || 1080;
  const aspect = videoWidth / videoHeight;
  let dw = availWidth;
  let dh = availWidth / aspect;
  if (dh > availHeight) {
    dh = availHeight;
    dw = availHeight * aspect;
  }
  const dx = (width - dw) / 2;
  const dy = (height - dh) / 2;

  ctx.save();
  // The recorded screen is the global canvas content, not an overlay clip.
  // It must not acquire a second frame/shadow while zooming.
  ctx.fillStyle = "#1e1e1e";
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.fill();
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
  const trackedFocus =
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
  const focusX = dx + trackedFocus.cx * dw;
  const focusY = dy + trackedFocus.cy * dh;
  const scale = zoom?.scale ?? 1;
  const drawAtCamera = (
    camera: { focusX: number; focusY: number; scale: number },
    alpha: number,
  ) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(dx + dw / 2, dy + dh / 2);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.focusX, -camera.focusY);
    if (videoEl.readyState >= 1) ctx.drawImage(videoEl, dx, dy, dw, dh);
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
  videoWindowBounds.value = { dx, dy, dw, dh };
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
  if (props.selectedZoom?.mode !== "manual") return;
  isMovingSelection.value = true;
  canvasRef.value?.setPointerCapture(event.pointerId);
  updateSelectedFocus(event);
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
    if (Boolean(layer.kind === "video" && layer.reactToZoom) !== followsZoom)
      continue;
    if (layer.kind === "audio") continue;
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
    const transform = layer.transform ?? { x: 0, y: 0, width: 1, height: 1 };
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
    ctx.drawImage(asset, dx, dy, dw, dh);
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

  drawBackground(ctx, width, height);

  const videoWindow = drawVideoWindow(ctx, width, height);
  if (videoWindow) drawWebcamLayers(ctx, videoWindow);
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
        ripples.value.push({
          x: videoWindow.dx + state.x * videoWindow.dw,
          y: videoWindow.dy + state.y * videoWindow.dh,
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
      const pointerX = videoWindow.dx + state.x * videoWindow.dw;
      const pointerY = videoWindow.dy + state.y * videoWindow.dh;

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
  if (videoWindow) drawComposition(ctx, videoWindow, false);

  if (props.isPlaying && videoEl.readyState >= 1) {
    emit("update:currentTime", videoEl.ended ? 0 : videoEl.currentTime);
  }
};

const draw = () => {
  renderCanvas();
  animationFrameId = requestAnimationFrame(draw);
};

onMounted(() => {
  resizeCanvas();
  resizeObserver = new ResizeObserver(resizeCanvas);
  if (containerRef.value) resizeObserver.observe(containerRef.value);
  draw();
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  videoEl.pause();
  backgroundVideo.pause();
  videoEl.removeEventListener("loadedmetadata", handleVideoMetadata);
  videoEl.removeEventListener("error", handleVideoError);
  videoEl.src = "";
  videoEl.load();
  backgroundVideo.removeAttribute("src");
  backgroundVideo.load();
  disposeCompositionMedia();
});
</script>

<template>
  <div class="canvas-island" ref="containerRef">
    <canvas
      ref="canvasRef"
      class="editor-canvas"
      :class="{ 'is-selection-editable': selectedZoom?.mode === 'manual' }"
      @pointerdown="beginSelectionMove"
      @pointermove="moveSelection"
      @pointerup="endSelectionMove"
      @pointercancel="endSelectionMove"
    ></canvas>
    <div
      class="zoom-selection-box"
      :class="{ locked: selectedZoom?.mode !== 'manual' }"
      :style="focusTargetStyle"
      aria-hidden="true"
    ></div>
  </div>
</template>

<style scoped>
.canvas-island {
  flex: 1;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  position: relative;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.editor-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.editor-canvas.is-selection-editable {
  cursor: move;
}

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
</style>
