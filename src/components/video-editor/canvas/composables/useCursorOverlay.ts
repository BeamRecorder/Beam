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
import { cursorClickSpringScale } from "../../composables/cursor-click-spring";
import { cursorShadowOffset } from '../../properties/cursor/cursor-shadow';
import type { ShadowDirection } from '../../properties/shadow-types';
import { cursorHotspotAtSize, cursorPositionAt, cursorTypeAt } from '../../properties/cursor/cursor-rendering';

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
  enableClickSpring: () => boolean;
  enableRipple: () => boolean;
  shadowBlur: () => number;
  shadowColor: () => string;
  shadowDirection: () => ShadowDirection;
  rippleColor: () => string;
  rippleSize: () => number;
  deviceScale: () => number;
  currentTime: () => number;
  isPlaying: () => boolean;
  editorData: () => ProjectEditorData | null | undefined;
  composition: () => any;
  isVideoEnabled: () => boolean;
  showBackground: () => boolean;
  onRenderOnce?: () => void;
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
        options.currentTime(),
        options.cursorSize(),
        options.cursorColor(),
        options.deviceScale(),
      ] as const,
    async () => {
      try {
        const rasterSize =
          options.cursorSize() * maxZoomScale * options.deviceScale();
        const state = cursorStateAt(options.editorData()?.cursor.events ?? [], options.currentTime());
        const cursorType = cursorTypeAt(options.selectedCursor(), state);
        const img = await getCursorImage(
          cursorType,
          rasterSize,
          options.cursorColor(),
        );
        customCursorImage.value = img;
        options.onRenderOnce?.();
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
        const comp = options.composition?.();
        const baseTransform = comp?.baseVideoTransform ?? { x: 0, y: 0, width: 1, height: 1 };
        const position = cursorPositionAt(state, { width: videoWidth || 1920, height: videoHeight || 1080 }, { x: videoWindow.dx, y: videoWindow.dy, width: videoWindow.dw, height: videoWindow.dh }, options.showBackground(), baseTransform, comp?.baseVideoIsMirrored ?? false);

        ripples.value.push({
          x: position.x,
          y: position.y,
          radius: 2,
          alpha: 1,
        });
      }
    }
    lastDrawTime = time;

    const state = cursorStateAt(cursorData.events, time);
    if (options.selectedCursor() === "automatic" && state?.cursorKind === "custom") {
      drawCursorWarning(ctx, "System cursor not translated", logicalWidth);
    }

    drawInCameraSpace(() => {
      // 1. Draw ripples in camera space
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

      // 2. Draw custom cursor in camera space confined strictly within video bounds
      const activeImage = customCursorImage.value;
      if (
        state?.visible &&
        activeImage &&
        activeImage.complete &&
        activeImage.naturalWidth > 0
      ) {
        const comp = options.composition?.();
        const baseTransform = comp?.baseVideoTransform ?? { x: 0, y: 0, width: 1, height: 1 };
        const position = cursorPositionAt(state, { width: videoWidth || 1920, height: videoHeight || 1080 }, { x: videoWindow.dx, y: videoWindow.dy, width: videoWindow.dw, height: videoWindow.dh }, options.showBackground(), baseTransform, comp?.baseVideoIsMirrored ?? false);

        const targetSize = options.cursorSize();
        const hotspot = cursorHotspotAtSize(cursorTypeAt(options.selectedCursor(), state), targetSize);

        ctx.save();
        if (options.enableShadow()) {
          ctx.shadowColor = options.shadowColor();
          ctx.shadowBlur = options.shadowBlur();
          const offset = cursorShadowOffset(options.shadowBlur(), options.shadowDirection());
          ctx.shadowOffsetX = offset.x;
          ctx.shadowOffsetY = offset.y;
        }

        const click = buttonEventsBetween(cursorData.events, Math.max(0, time - .28), time).at(-1);
        const age = click ? Math.max(0, time - click.sessionNs / 1_000_000_000) : Infinity;
        const clickScale = cursorClickSpringScale(age, options.enableClickSpring());
        ctx.translate(position.x, position.y);
        ctx.scale(clickScale, clickScale);
        ctx.drawImage(
          activeImage,
          -hotspot.x,
          -hotspot.y,
          targetSize,
          targetSize,
        );
        ctx.restore();
      }
    });

    ripples.value = ripples.value.filter((ripple) => ripple.alpha > 0);
  };

  return {
    customCursorImage,
    ripples,
    updateAndDrawRipplesAndCursor,
  };
}
