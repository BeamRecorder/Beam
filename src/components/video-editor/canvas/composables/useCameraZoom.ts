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
  focusX?: number;
  focusY?: number;
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

  let renderedCamera: { focusX: number; focusY: number; scale: number } | null =
    null;
  let lastCameraUpdateMs = 0;

  const videoWindowBounds = ref<VideoWindowBounds | null>(null);
  const baseVideoHitBounds = ref<{
    dx: number;
    dy: number;
    dw: number;
    dh: number;
  } | null>(null);
  const overlayWindowBounds = ref<VideoWindowBounds | null>(null);
  const isMovingSelection = ref(false);

  const resetCamera = () => {
    renderedCamera = null;
    lastCameraUpdateMs = 0;
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

    const scale = bounds.scale ?? 1;
    const centerX = bounds.dx + bounds.dw / 2;
    const centerY = bounds.dy + bounds.dh / 2;
    const focusX = bounds.focusX ?? centerX;
    const focusY = bounds.focusY ?? centerY;

    const unzoomedTargetWidth = bounds.dw / selectionScale;
    const unzoomedTargetHeight = bounds.dh / selectionScale;
    const unzoomedTargetLeft =
      bounds.dx + selectedZoom.focus.cx * bounds.dw - unzoomedTargetWidth / 2;
    const unzoomedTargetTop =
      bounds.dy + selectedZoom.focus.cy * bounds.dh - unzoomedTargetHeight / 2;

    const zoomedLeft = centerX + (unzoomedTargetLeft - focusX) * scale;
    const zoomedTop = centerY + (unzoomedTargetTop - focusY) * scale;
    const zoomedWidth = unzoomedTargetWidth * scale;
    const zoomedHeight = unzoomedTargetHeight * scale;

    return {
      left: `${zoomedLeft}px`,
      top: `${zoomedTop}px`,
      width: `${zoomedWidth}px`,
      height: `${zoomedHeight}px`,
    };
  });

  const updateSelectedFocus = (event: PointerEvent) => {
    const canvas = options.canvasRef();
    const bounds = videoWindowBounds.value;
    const selectedZoom = options.selectedZoom();
    if (!canvas || !bounds || !selectedZoom || selectedZoom.mode !== "manual")
      return;
    const rect = canvas.getBoundingClientRect();
    const clientX = event.clientX - rect.left;
    const clientY = event.clientY - rect.top;

    const scale = bounds.scale ?? 1;
    const centerX = bounds.dx + bounds.dw / 2;
    const centerY = bounds.dy + bounds.dh / 2;
    const focusX = bounds.focusX ?? centerX;
    const focusY = bounds.focusY ?? centerY;

    const unzoomedX = (clientX - centerX) / scale + focusX;
    const unzoomedY = (clientY - centerY) / scale + focusY;

    const cx = Math.min(1, Math.max(0, (unzoomedX - bounds.dx) / bounds.dw));
    const cy = Math.min(1, Math.max(0, (unzoomedY - bounds.dy) / bounds.dh));
    options.onUpdateZoom({ ...selectedZoom, focus: { cx, cy } });
  };

  const beginSelectionMove = (event: PointerEvent) => {
    const selectedZoom = options.selectedZoom();
    const isManualZoomActive = selectedZoom?.mode === "manual" && options.activeTab() === "zoom";

    // When configuring a manual zoom, skip raycasting/hit-testing for webcam and base video
    if (!isManualZoomActive) {
      if (options.selectWebcamAt(event)) return;
      const canvas = options.canvasRef();
      const hitBounds = baseVideoHitBounds.value ?? videoWindowBounds.value;
      if (canvas && hitBounds) {
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const inVideo =
          x >= hitBounds.dx &&
          x <= hitBounds.dx + hitBounds.dw &&
          y >= hitBounds.dy &&
          y <= hitBounds.dy + hitBounds.dh;

        if (inVideo) {
          options.onSelectBaseVideo();
          return;
        }
      }

      options.onSelectCanvas();

      if (options.selectedTransformLayerExists())
        options.onDeselectTransformLayer();
      if (selectedZoom && options.activeTab() !== "zoom")
        options.onDeselectZoom();
    }

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
    const baseCrop = !isCropping
      ? options.composition?.().baseVideoCrop
      : undefined;
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
    const baseTransform = options.composition?.().baseVideoTransform ?? {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    };
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
      const isBaseVideoMirrored =
        options.composition?.().baseVideoIsMirrored ?? false;
      const baseAppearance = options.composition?.().baseVideoAppearance;
      const baseCornerRadius = (() => {
        if (!baseAppearance) return outputCanvas.showBackground ? 16 : 0;
        const r = baseAppearance.cornerRadius;
        if (r === "none") return 0;
        if (r === "sm") return 8;
        if (r === "md") return 16;
        if (r === "lg") return 24;
        if (r === "full")
          return Math.min(positionedMedia.width, positionedMedia.height) / 2;
        if (typeof r === "number") return r;
        return outputCanvas.showBackground ? 16 : 0;
      })();

      if (videoEl.readyState >= 1) {
        ctx.save();

        const shadowSize = baseAppearance?.shadowSize ?? "md";
        const blur =
          shadowSize !== "none"
            ? (({ sm: 12, md: 24, lg: 36 } as Record<string, number>)[
                shadowSize
              ] ?? 24)
            : 0;
        const vx = dx + positionedMedia.x;
        const vy = dy + positionedMedia.y;
        const vw = positionedMedia.width;
        const vh = positionedMedia.height;

        // Build the clip path
        ctx.beginPath();
        ctx.roundRect(vx, vy, vw, vh, baseCornerRadius);

        if (blur > 0) {
          // Canvas shadows only render on fill/stroke, not on drawImage.
          // Strategy: fill the shape solid (triggers shadow around it),
          // then clear shadow and draw the video clipped over it.
          const direction = baseAppearance?.shadowDirection ?? "bottom";
          ctx.shadowColor = baseAppearance?.shadowColor ?? "rgba(0, 0, 0, 0.5)";
          ctx.shadowBlur = blur;
          ctx.shadowOffsetX =
            direction === "top-left"
              ? -blur * 0.4
              : direction === "bottom-right"
                ? blur * 0.4
                : 0;
          ctx.shadowOffsetY =
            direction === "top-left"
              ? -blur * 0.4
              : direction === "all"
                ? 0
                : blur * 0.4;
          // Opaque fill → shadow is rendered at full opacity around the shape
          ctx.fillStyle = "rgb(0, 0, 0)";
          ctx.fill();
          // Clear shadow so video draw isn't also shadowed
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          // Re-establish the clip path (fill() consumed the current path)
          ctx.beginPath();
          ctx.roundRect(vx, vy, vw, vh, baseCornerRadius);
        }

        ctx.clip();

        if (isBaseVideoMirrored) {
          ctx.translate(vx * 2 + vw, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(
          videoEl,
          source.x,
          source.y,
          source.width,
          source.height,
          vx,
          vy,
          vw,
          vh,
        );
        ctx.restore();
      }
      ctx.restore();
    };

    const targetCamera = { focusX, focusY, scale };
    const now = performance.now();
    const deltaMs =
      lastCameraUpdateMs > 0
        ? Math.min(64, Math.max(1, now - lastCameraUpdateMs))
        : 16;
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

    videoWindowBounds.value = {
      dx: dx + media.x,
      dy: dy + media.y,
      dw: media.width,
      dh: media.height,
      scale: camera.scale,
      focusX: camera.focusX,
      focusY: camera.focusY,
    };
    baseVideoHitBounds.value = {
      dx: dx + positionedMedia.x,
      dy: dy + positionedMedia.y,
      dw: positionedMedia.width,
      dh: positionedMedia.height,
    };
    overlayWindowBounds.value = {
      dx,
      dy,
      dw,
      dh,
      scale: camera.scale,
      focusX: camera.focusX,
      focusY: camera.focusY,
    };

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
