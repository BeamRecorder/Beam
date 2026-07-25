import { ref, watch } from "vue";
import type { ProjectEditorData } from "~/api/types/capture-session";
import {
  buttonEventsBetween,
  cursorStateAt,
} from "../../composables/cursorPlayback";
import {
  type CursorType,
  useCursorReplacer,
} from "../../properties/cursor/useCursorReplacer";
import { ZOOM_DEPTH_SCALES } from "../../zoom/zoom-types";
import { outputPoint } from "../output-canvas";

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

export interface Ripple {
  x: number;
  y: number;
  radius: number;
  alpha: number;
}

export interface UseCursorOverlayOptions {
  selectedCursor: () => CursorType;
  cursorSize: () => number;
  cursorColor: () => string;
  enableShadow: () => boolean;
  enableRipple: () => boolean;
  shadowBlur: () => number;
  shadowColor: () => string;
  rippleColor: () => string;
  rippleSize: () => number;
  deviceScale: () => number;
  currentTime: () => number;
  isPlaying: () => boolean;
  editorData: () => ProjectEditorData | null | undefined;
  isVideoEnabled: () => boolean;
  showBackground: () => boolean;
}

export const getRippleStyleColor = (hex: string, alpha: number) => {
  if (hex.startsWith("#")) {
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
};

export function useCursorOverlay(options: UseCursorOverlayOptions) {
  const { getCursorImage } = useCursorReplacer();
  const customCursorImage = ref<HTMLImageElement | null>(null);
  const ripples = ref<Ripple[]>([]);
  let lastDrawTime = 0;

  const maxZoomScale = Math.max(...Object.values(ZOOM_DEPTH_SCALES));

  watch(
    () =>
      [
        options.selectedCursor(),
        options.cursorSize(),
        options.cursorColor(),
        options.deviceScale(),
      ] as const,
    async () => {
      try {
        const rasterSize =
          options.cursorSize() * maxZoomScale * options.deviceScale();
        const cursorType =
          options.selectedCursor() === "automatic"
            ? "default"
            : options.selectedCursor();
        const img = await getCursorImage(
          cursorType,
          rasterSize,
          options.cursorColor(),
        );
        customCursorImage.value = img;
      } catch (err) {
        console.error("Failed to load custom cursor image:", err);
        customCursorImage.value = null;
      }
    },
    { immediate: true },
  );

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

  const updateAndDrawRipplesAndCursor = (
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
    videoWidth: number,
    videoHeight: number,
    logicalWidth: number,
    drawInCameraSpace: (drawContent: () => void) => void,
  ) => {
    const cursorData = options.editorData()?.cursor;
    if (!cursorData?.available) {
      if (options.isVideoEnabled() && cursorData && !cursorData.available) {
        drawCursorWarning(ctx, "Cursor data missing", logicalWidth);
      }
      return;
    }

    const time = options.currentTime();
    const isPlaying = options.isPlaying();

    if (options.enableRipple() && isPlaying && time >= lastDrawTime) {
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
        const point = outputPoint(
          state.x,
          state.y,
          videoWidth || 1920,
          videoHeight || 1080,
          videoWindow.dw,
          videoWindow.dh,
          options.showBackground(),
        );
        ripples.value.push({
          x: videoWindow.dx + point.cx * videoWindow.dw,
          y: videoWindow.dy + point.cy * videoWindow.dh,
          radius: 2,
          alpha: 1,
        });
      }
    }
    lastDrawTime = time;

    const state = cursorStateAt(cursorData.events, time);

    drawInCameraSpace(() => {
      for (const ripple of ripples.value) {
        ctx.strokeStyle = getRippleStyleColor(
          options.rippleColor(),
          ripple.alpha,
        );
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
        ctx.stroke();
        if (isPlaying) {
          ripple.radius += options.rippleSize() / 25;
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
      const point = outputPoint(
        state.x,
        state.y,
        videoWidth || 1920,
        videoHeight || 1080,
        videoWindow.dw,
        videoWindow.dh,
        options.showBackground(),
      );
      const pointerX = videoWindow.dx + point.cx * videoWindow.dw;
      const pointerY = videoWindow.dy + point.cy * videoWindow.dh;

      const targetSize = options.cursorSize();
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

      const cursorType =
        options.selectedCursor() === "automatic"
          ? "default"
          : options.selectedCursor();
      const hotspot = cursorHotspots[cursorType];
      const cursorScale = renderSize / 32;
      const hxScreen = hotspot.x * cursorScale;
      const hyScreen = hotspot.y * cursorScale;

      ctx.save();
      if (options.enableShadow()) {
        ctx.shadowColor = options.shadowColor();
        ctx.shadowBlur = options.shadowBlur() * scale;
        ctx.shadowOffsetX = Math.round(options.shadowBlur() * 0.33 * scale);
        ctx.shadowOffsetY = Math.round(options.shadowBlur() * 0.5 * scale);
      }

      ctx.drawImage(
        activeImage,
        screenX - hxScreen,
        screenY - hyScreen,
        renderSize,
        renderSize,
      );
      ctx.restore();
    }
    ripples.value = ripples.value.filter((ripple) => ripple.alpha > 0);
  };

  return {
    customCursorImage,
    ripples,
    updateAndDrawRipplesAndCursor,
  };
}
