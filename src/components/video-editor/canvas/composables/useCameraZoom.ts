import { ref, computed } from "vue";
import type { ZoomElement } from "../../zoom/zoom-types";
import { clampFocusToScale, zoomAtTime } from "../../zoom/zoom-playback";
import {
  createCursorFollowCameraState,
  updateCursorFollowCamera,
} from "../../zoom/zoom-camera";
import { createCameraVelocity, stepCameraSpring } from "../../zoom/zoom-spring";
import { cursorStateAt } from "../../composables/cursorPlayback";
import {
  framedMediaRect,
  outputPoint,
  coverSourceRect,
  outputPreviewRect,
  type OutputCanvasSettings,
} from "../output-canvas";
import type { ProjectEditorData } from "~/api/types/capture-api";
import type { ProjectComposition } from "../../composition/composition-types";

export interface VideoWindowBounds {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  scale: number;
}

export interface RenderedVideoWindow extends VideoWindowBounds {
  focusX: number;
  focusY: number;
}

export interface UseCameraZoomOptions {
  canvasRef: () => HTMLCanvasElement | null;
  outputCanvas: () => OutputCanvasSettings;
  isVideoEnabled: () => boolean;
  zoomElements: () => ZoomElement[];
  selectedZoom: () => ZoomElement | null;
  currentTime: () => number;
  isPlaying: () => boolean;
  editorData: () => ProjectEditorData | null | undefined;
  activeTab: () => string;
  composition?: () => ProjectComposition;
  isCropping?: () => boolean | undefined;
  drawBackground: (
    ctx: CanvasRenderingContext2D,
    bounds: { x: number; y: number; width: number; height: number },
  ) => void;
  videoError: () => string | null;
  onUpdateZoom: (zoom: ZoomElement) => void;
  onSelectBaseVideo: () => void;
  onSelectCanvas: () => void;
  onDeselectTransformLayer: () => void;
  onDeselectZoom: () => void;
  selectWebcamAt: (event: PointerEvent) => boolean;
  selectedTransformLayerExists: () => boolean;
}

export function useCameraZoom(options: UseCameraZoomOptions) {
  const cameraVelocity = createCameraVelocity();
  const cursorFollowCamera = createCursorFollowCameraState();

  let previousCamera: { focusX: number; focusY: number; scale: number } | null =
    null;
  let renderedCamera: { focusX: number; focusY: number; scale: number } | null =
    null;
  let lastCameraUpdateMs = 0;

  const videoWindowBounds = ref<VideoWindowBounds | null>(null);
  const overlayWindowBounds = ref<VideoWindowBounds | null>(null);
  const isMovingSelection = ref(false);

  const resetCamera = () => {
    previousCamera = null;
    renderedCamera = null;
    Object.assign(cameraVelocity, createCameraVelocity());
  };

  const focusTargetStyle = computed(() => {
    const bounds = videoWindowBounds.value;
    const selectedZoom = options.selectedZoom();
    if (
      !selectedZoom ||
      selectedZoom.mode !== "manual" ||
      options.isPlaying() ||
      !bounds
    )
      return { display: "none" };
    const selectionScale = [1.25, 1.5, 1.8, 2.2, 3.5, 5][
      selectedZoom.depth - 1
    ];
    return {
      left: `${bounds.dx + selectedZoom.focus.cx * bounds.dw - bounds.dw / selectionScale / 2}px`,
      top: `${bounds.dy + selectedZoom.focus.cy * bounds.dh - bounds.dh / selectionScale / 2}px`,
      width: `${bounds.dw / selectionScale}px`,
      height: `${bounds.dh / selectionScale}px`,
    };
  });

  const updateSelectedFocus = (event: PointerEvent) => {
    const canvas = options.canvasRef();
    const bounds = videoWindowBounds.value;
    const selectedZoom = options.selectedZoom();
    if (!canvas || !bounds || !selectedZoom || selectedZoom.mode !== "manual")
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
    options.onUpdateZoom({ ...selectedZoom, focus: { cx, cy } });
  };

  const beginSelectionMove = (event: PointerEvent) => {
    if (options.selectWebcamAt(event)) return;
    const canvas = options.canvasRef();
    const bounds = videoWindowBounds.value;
    if (canvas && bounds) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (
        x >= bounds.dx &&
        x <= bounds.dx + bounds.dw &&
        y >= bounds.dy &&
        y <= bounds.dy + bounds.dh
      ) {
        options.onSelectBaseVideo();
        return;
      }
      options.onSelectCanvas();
      return;
    }
    if (options.selectedTransformLayerExists())
      options.onDeselectTransformLayer();
    const selectedZoom = options.selectedZoom();
    if (selectedZoom && options.activeTab() !== "zoom")
      options.onDeselectZoom();
    if (selectedZoom?.mode !== "manual") return;
    isMovingSelection.value = true;
    options.canvasRef()?.setPointerCapture(event.pointerId);
    updateSelectedFocus(event);
  };

  const moveSelection = (event: PointerEvent) => {
    if (isMovingSelection.value) updateSelectedFocus(event);
  };

  const endSelectionMove = (event: PointerEvent) => {
    isMovingSelection.value = false;
    const canvas = options.canvasRef();
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };

  const drawVideoWindow = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    videoEl: HTMLVideoElement,
  ): RenderedVideoWindow | null => {
    const outputCanvas = options.outputCanvas();
    const preview = outputPreviewRect(width, height, outputCanvas);
    if (!options.isVideoEnabled()) {
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(preview.x, preview.y, preview.width, preview.height);
      ctx.fillStyle = "#ffffff";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "Video track disabled",
        preview.x + preview.width / 2,
        preview.y + preview.height / 2,
      );
      return null;
    }

    const videoWidth = videoEl.videoWidth || 1920;
    const videoHeight = videoEl.videoHeight || 1080;
    const { x: dx, y: dy, width: dw, height: dh } = preview;

    const isCropping = options.isCropping?.();
    const baseCrop = !isCropping ? options.composition?.().baseVideoCrop : undefined;
    const cropX = baseCrop ? baseCrop.x * videoWidth : 0;
    const cropY = baseCrop ? baseCrop.y * videoHeight : 0;
    const cropW = baseCrop ? baseCrop.width * videoWidth : videoWidth;
    const cropH = baseCrop ? baseCrop.height * videoHeight : videoHeight;

    const source = outputCanvas.showBackground
      ? { x: cropX, y: cropY, width: cropW, height: cropH }
      : coverSourceRect(cropW, cropH, dw, dh);
    if (!outputCanvas.showBackground) {
      source.x += cropX;
      source.y += cropY;
    }

    const media = outputCanvas.showBackground
      ? framedMediaRect(cropW, cropH, dw, dh)
      : { x: 0, y: 0, width: dw, height: dh };
    const baseTransform = options.composition?.().baseVideoTransform ?? { x: 0, y: 0, width: 1, height: 1 };
    const positionedMedia = {
      x: media.x + baseTransform.x * media.width,
      y: media.y + baseTransform.y * media.height,
      width: media.width * baseTransform.width,
      height: media.height * baseTransform.height,
    };

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(dx, dy, dw, dh, 16);
    ctx.clip();

    const editorData = options.editorData();
    const currentTime = options.currentTime();
    const isPlaying = options.isPlaying();

    const zoom = zoomAtTime(
      options.zoomElements(),
      currentTime * 1000,
      editorData?.cursor.telemetry ?? [],
    );

    const renderedCursor = cursorStateAt(
      editorData?.cursor.events ?? [],
      currentTime,
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
            currentTime * 1000,
          )
        : (zoom?.focus ?? { cx: 0.5, cy: 0.5 });

    const scale = zoom?.scale ?? 1;
    const trackedFocus =
      zoom?.mode === "auto"
        ? outputPoint(
            sourceFocus.cx,
            sourceFocus.cy,
            videoWidth,
            videoHeight,
            dw,
            dh,
            outputCanvas.showBackground,
          )
        : sourceFocus;

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
      const isBaseVideoMirrored = options.composition?.().baseVideoIsMirrored ?? false;
      if (videoEl.readyState >= 1) {
        if (outputCanvas.showBackground) {
          ctx.save();
          ctx.shadowColor = "rgba(0, 0, 0, .35)";
          ctx.shadowBlur = 24;
          ctx.shadowOffsetY = 10;
          ctx.beginPath();
          ctx.roundRect(
            dx + positionedMedia.x,
            dy + positionedMedia.y,
            positionedMedia.width,
            positionedMedia.height,
            16,
          );
          ctx.fillStyle = "rgba(0, 0, 0, .01)";
          ctx.fill();
          ctx.clip();
          if (isBaseVideoMirrored) {
            ctx.translate((dx + positionedMedia.x) * 2 + positionedMedia.width, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(
            videoEl,
            source.x,
            source.y,
            source.width,
            source.height,
            dx + positionedMedia.x,
            dy + positionedMedia.y,
            positionedMedia.width,
            positionedMedia.height,
          );
          ctx.restore();
        } else {
          ctx.save();
          if (isBaseVideoMirrored) {
            ctx.translate((dx + positionedMedia.x) * 2 + positionedMedia.width, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(
            videoEl,
            source.x,
            source.y,
            source.width,
            source.height,
            dx + positionedMedia.x,
            dy + positionedMedia.y,
            positionedMedia.width,
            positionedMedia.height,
          );
          ctx.restore();
        }
      }
      ctx.restore();
    };

    const targetCamera = { focusX, focusY, scale };
    const now = performance.now();
    const deltaMs = Math.min(80, Math.max(1, now - lastCameraUpdateMs));
    lastCameraUpdateMs = now;

    if (!isPlaying || !renderedCamera) {
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
    options.drawBackground(ctx, { x: dx, y: dy, width: dw, height: dh });
    ctx.restore();

    const previous = previousCamera;
    const cameraDistance = previous
      ? Math.hypot(focusX - previous.focusX, focusY - previous.focusY) +
        Math.abs(scale - previous.scale) * Math.max(dw, dh)
      : 0;

    if (
      isPlaying &&
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

    const videoError = options.videoError();
    if (videoError) {
      ctx.save();
      ctx.translate(dx + dw / 2, dy + dh / 2);
      ctx.scale(scale, scale);
      ctx.translate(-focusX, -focusY);
      ctx.fillStyle = "#ef4444";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(videoError, focusX, focusY);
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
      // Transform handles must use the untransformed media frame as their
      // coordinate system, just like webcam handles. Using the already scaled
      // rectangle feeds the resize back into its own delta and makes it race.
      dx: dx + media.x,
      dy: dy + media.y,
      dw: media.width,
      dh: media.height,
      scale: camera.scale,
    };
    overlayWindowBounds.value = { dx, dy, dw, dh, scale: camera.scale };

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
    videoWindow: RenderedVideoWindow,
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

  return {
    videoWindowBounds,
    overlayWindowBounds,
    focusTargetStyle,
    resetCamera,
    beginSelectionMove,
    moveSelection,
    endSelectionMove,
    drawVideoWindow,
    drawInCameraSpace,
  };
}
