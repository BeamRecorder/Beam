import { computed, ref } from "vue";
import type { ZoomElement } from "../../zoom/zoom-types";
import { clampFocusToScale, zoomAtTime } from "../../zoom/zoom-playback";
import { createCursorFollowCameraState, updateCursorFollowCamera } from "../../zoom/zoom-camera";
import { createCameraVelocity, stepCameraSpring } from "../../zoom/zoom-spring";
import { cursorStateAt } from "../../composables/cursorPlayback";
import { framedMediaRect, outputPoint, coverSourceRect, outputPreviewRect, type OutputCanvasSettings } from "../output-canvas";
import type { ProjectEditorData } from "~/api/types/capture-api";
import { activeClipsAt } from "../../composition/engine/clip-engine";
import type { ClipComposition, VisualClip } from "../../composition/composition-types";
import { drawDecoratedMedia } from "../../composition/appearance/render-decorated-media";

export interface VideoWindowBounds {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  scale: number;
  focusX?: number;
  focusY?: number;
}
export interface RenderedVideoWindow extends VideoWindowBounds { focusX: number; focusY: number }

export interface UseCameraZoomOptions {
  canvasRef: () => HTMLCanvasElement | null;
  outputCanvas: () => OutputCanvasSettings;
  zoomElements: () => ZoomElement[];
  selectedZoom: () => ZoomElement | null;
  currentTime: () => number;
  isPlaying: () => boolean;
  editorData: () => ProjectEditorData | null | undefined;
  activeTab: () => string;
  composition: () => ClipComposition;
  isCropping?: () => boolean | undefined;
  drawBackground: (ctx: CanvasRenderingContext2D, bounds: { x: number; y: number; width: number; height: number }) => void;
  videoError: () => string | null;
  renderVisualStack?: (ctx: CanvasRenderingContext2D, videoWindow: RenderedVideoWindow, drawScreen: () => void) => void;
  onUpdateZoom: (zoom: ZoomElement) => void;
  onPreviewZoom?: (zoom: ZoomElement) => void;
  onSelectScreenClip: (clipId: string) => void;
  onSelectCanvas: () => void;
  onDeselectTransformClip: () => void;
  onDeselectZoom: () => void;
  selectVisualAt: (event: PointerEvent) => boolean;
  selectedTransformClipExists: () => boolean;
}

export function useCameraZoom(options: UseCameraZoomOptions) {
  const velocity = createCameraVelocity();
  const cursorFollow = createCursorFollowCameraState();
  let renderedCamera: { focusX: number; focusY: number; scale: number } | null = null;
  let lastUpdateMs = 0;
  const videoWindowBounds = ref<VideoWindowBounds | null>(null);
  const screenHitBounds = ref<{ dx: number; dy: number; dw: number; dh: number } | null>(null);
  const overlayWindowBounds = ref<VideoWindowBounds | null>(null);
  const isMovingSelection = ref(false);

  const screenClip = (): VisualClip | null => activeClipsAt(options.composition(), options.currentTime() * 1_000)
    .find((clip): clip is VisualClip => clip.kind === "screen") ?? null;

  const resetCamera = () => {
    renderedCamera = null;
    lastUpdateMs = 0;
    Object.assign(velocity, createCameraVelocity());
  };

  const focusTargetStyle = computed(() => {
    const bounds = videoWindowBounds.value;
    const selected = options.selectedZoom();
    if (!selected || selected.mode !== "manual" || options.isPlaying() || !bounds) return { display: "none" };
    const selectionScale = [1.25, 1.5, 1.8, 2.2, 3.5, 5][selected.depth - 1];
    const scale = bounds.scale || 1;
    const centerX = bounds.dx + bounds.dw / 2;
    const centerY = bounds.dy + bounds.dh / 2;
    const focusX = bounds.focusX ?? centerX;
    const focusY = bounds.focusY ?? centerY;
    const targetWidth = bounds.dw / selectionScale;
    const targetHeight = bounds.dh / selectionScale;
    const left = bounds.dx + selected.focus.cx * bounds.dw - targetWidth / 2;
    const top = bounds.dy + selected.focus.cy * bounds.dh - targetHeight / 2;
    return {
      width: `${targetWidth * scale}px`,
      height: `${targetHeight * scale}px`,
      transform: `translate3d(${centerX + (left - focusX) * scale}px, ${centerY + (top - focusY) * scale}px, 0)`,
      willChange: isMovingSelection.value ? "transform" : "auto",
    };
  });

  const updateFocus = (event: PointerEvent, final: boolean) => {
    const canvas = options.canvasRef();
    const bounds = videoWindowBounds.value;
    const selected = options.selectedZoom();
    if (!canvas || !bounds || !selected || selected.mode !== "manual") return;
    const rect = canvas.getBoundingClientRect();
    const scale = bounds.scale || 1;
    const centerX = bounds.dx + bounds.dw / 2;
    const centerY = bounds.dy + bounds.dh / 2;
    const focusX = bounds.focusX ?? centerX;
    const focusY = bounds.focusY ?? centerY;
    const unzoomedX = (event.clientX - rect.left - centerX) / scale + focusX;
    const unzoomedY = (event.clientY - rect.top - centerY) / scale + focusY;
    const updated = {
      ...selected,
      focus: {
        cx: Math.min(1, Math.max(0, (unzoomedX - bounds.dx) / bounds.dw)),
        cy: Math.min(1, Math.max(0, (unzoomedY - bounds.dy) / bounds.dh)),
      },
    };
    (final ? options.onUpdateZoom : options.onPreviewZoom ?? options.onUpdateZoom)(updated);
  };

  const beginSelectionMove = (event: PointerEvent) => {
    const selectedZoom = options.selectedZoom();
    const editingManualZoom = selectedZoom?.mode === "manual" && options.activeTab() === "zoom";
    if (!editingManualZoom) {
      if (options.selectVisualAt(event)) return;
      const canvas = options.canvasRef();
      const bounds = screenHitBounds.value ?? videoWindowBounds.value;
      if (canvas && bounds) {
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        if (x >= bounds.dx && x <= bounds.dx + bounds.dw && y >= bounds.dy && y <= bounds.dy + bounds.dh) {
          const screen = screenClip();
          if (screen) options.onSelectScreenClip(screen.id);
          return;
        }
      }
      options.onSelectCanvas();
      if (options.selectedTransformClipExists()) options.onDeselectTransformClip();
      if (selectedZoom && options.activeTab() !== "zoom") options.onDeselectZoom();
    }
    if (selectedZoom?.mode !== "manual") return;
    isMovingSelection.value = true;
    options.canvasRef()?.setPointerCapture(event.pointerId);
    updateFocus(event, false);
  };
  const moveSelection = (event: PointerEvent) => { if (isMovingSelection.value) updateFocus(event, false); };
  const endSelectionMove = (event: PointerEvent) => {
    if (isMovingSelection.value) updateFocus(event, true);
    isMovingSelection.value = false;
    const canvas = options.canvasRef();
    if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };

  const drawVideoWindow = (ctx: CanvasRenderingContext2D, width: number, height: number, video: HTMLVideoElement): RenderedVideoWindow | null => {
    const output = options.outputCanvas();
    const preview = outputPreviewRect(width, height, output);
    const screen = screenClip();
    if (!screen) {
      ctx.fillStyle = "rgba(15,23,42,.85)";
      ctx.fillRect(preview.x, preview.y, preview.width, preview.height);
      ctx.fillStyle = "#fff";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Video track disabled", preview.x + preview.width / 2, preview.y + preview.height / 2);
      return null;
    }
    const videoWidth = video.videoWidth || 1920;
    const videoHeight = video.videoHeight || 1080;
    const { x: dx, y: dy, width: dw, height: dh } = preview;
    const crop = options.isCropping?.() ? undefined : screen.crop;
    const cropX = crop ? crop.x * videoWidth : 0;
    const cropY = crop ? crop.y * videoHeight : 0;
    const cropW = crop ? crop.width * videoWidth : videoWidth;
    const cropH = crop ? crop.height * videoHeight : videoHeight;
    const source = output.showBackground ? { x: cropX, y: cropY, width: cropW, height: cropH } : coverSourceRect(cropW, cropH, dw, dh);
    if (!output.showBackground) { source.x += cropX; source.y += cropY; }
    const media = output.showBackground ? framedMediaRect(cropW, cropH, dw, dh) : { x: 0, y: 0, width: dw, height: dh };
    const positioned = {
      x: media.x + screen.transform.x * media.width,
      y: media.y + screen.transform.y * media.height,
      width: media.width * screen.transform.width,
      height: media.height * screen.transform.height,
    };

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(dx, dy, dw, dh, 16);
    ctx.clip();
    const currentTime = options.currentTime();
    const zoom = zoomAtTime(options.zoomElements(), currentTime * 1_000, options.editorData()?.cursor.telemetry ?? []);
    const cursor = cursorStateAt(options.editorData()?.cursor.events ?? [], currentTime);
    const sourceFocus = zoom?.mode === "auto"
      ? updateCursorFollowCamera(cursorFollow, cursor ? { cx: cursor.x, cy: cursor.y } : null, zoom.focus, zoom.scale, zoom.strength, currentTime * 1_000)
      : zoom?.focus ?? { cx: .5, cy: .5 };
    const targetScale = zoom?.scale ?? 1;
    const trackedFocus = zoom?.mode === "auto"
      ? outputPoint(sourceFocus.cx, sourceFocus.cy, videoWidth, videoHeight, dw, dh, output.showBackground)
      : sourceFocus;
    const cameraFocus = clampFocusToScale(trackedFocus, targetScale);
    const target = { focusX: dx + cameraFocus.cx * dw, focusY: dy + cameraFocus.cy * dh, scale: targetScale };
    if (!renderedCamera || !options.isPlaying()) renderedCamera = target;
    else {
      const now = performance.now();
      const dt = Math.min(.05, Math.max(.001, (now - lastUpdateMs) / 1_000));
      lastUpdateMs = now;
      renderedCamera = stepCameraSpring(renderedCamera, velocity, target, dt);
    }
    const camera = renderedCamera;
    const renderedWindow: RenderedVideoWindow = { dx, dy, dw, dh, scale: camera.scale, focusX: camera.focusX, focusY: camera.focusY };
    const drawScreen = () => {
      ctx.save();
      ctx.translate(dx + dw / 2, dy + dh / 2);
      ctx.scale(camera.scale, camera.scale);
      ctx.translate(-camera.focusX, -camera.focusY);
      options.drawBackground(ctx, { x: dx, y: dy, width: dw, height: dh });
      if (video.readyState >= 1) {
        drawDecoratedMedia(ctx, {
          source: video,
          sourceRect: source,
          rect: { x: dx + positioned.x, y: dy + positioned.y, width: positioned.width, height: positioned.height },
          appearance: screen.appearance ?? {
            cornerRadius: output.showBackground ? "md" : "none",
            shadowSize: "md",
            shadowColor: "#000000",
            shadowDirection: "bottom",
            borderEnabled: false,
            borderColor: "#000000",
            borderWidth: 1,
            frame: "none",
            frameTitle: "",
            frameColor: "#c0c0c0",
            frameShowMenu: true,
            frameShowScrollbars: true,
          },
          title: screen.name,
          mirrored: screen.isMirrored,
        });
      } else {
        ctx.fillStyle = "#334155";
        ctx.fillRect(dx, dy, dw, dh);
        ctx.fillStyle = "#fff";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(options.videoError() || "Loading video recording...", width / 2, height / 2);
      }
      ctx.restore();
    };
    if (options.renderVisualStack) options.renderVisualStack(ctx, renderedWindow, drawScreen);
    else drawScreen();
    ctx.restore();

    videoWindowBounds.value = { dx: dx + media.x, dy: dy + media.y, dw: media.width, dh: media.height, scale: camera.scale, focusX: camera.focusX, focusY: camera.focusY };
    screenHitBounds.value = { dx: dx + positioned.x, dy: dy + positioned.y, dw: positioned.width, dh: positioned.height };
    overlayWindowBounds.value = { dx, dy, dw, dh, scale: camera.scale, focusX: camera.focusX, focusY: camera.focusY };
    return renderedWindow;
  };

  const drawInCameraSpace = (ctx: CanvasRenderingContext2D, window: RenderedVideoWindow, draw: () => void) => {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(window.dx, window.dy, window.dw, window.dh, 0);
    ctx.clip();
    ctx.translate(window.dx + window.dw / 2, window.dy + window.dh / 2);
    ctx.scale(window.scale, window.scale);
    ctx.translate(-window.focusX, -window.focusY);
    draw();
    ctx.restore();
  };

  return { videoWindowBounds, overlayWindowBounds, focusTargetStyle, resetCamera, beginSelectionMove, moveSelection, endSelectionMove, drawVideoWindow, drawInCameraSpace };
}
