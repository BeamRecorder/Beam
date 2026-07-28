import { clampFocusToScale, zoomAtTime } from "../../video-editor/zoom/zoom-playback";
import { buttonEventsBetween, cursorStateAt } from "../../video-editor/composables/cursorPlayback";
import type { CompositionSnapshot, CursorRenderSettings } from "../export-types";
import { activeClipsAt } from "../../video-editor/composition/engine/clip-engine";
import { getCaptionTransform, isVisualClip, type CaptionClip, type VisualClip } from "../../video-editor/composition/composition-types";
import { drawWebcamOverlay, webcamSettingsForAppearance } from "../../video-editor/composition/webcam/webcam-zoom";
import { coverSourceRect, framedMediaRect, outputPoint } from "../../video-editor/canvas/output-canvas";
import { drawDecoratedMedia } from "../../video-editor/composition/appearance/render-decorated-media";
import { cursorClickSpringScale } from "../../video-editor/composables/cursor-click-spring";
import { cursorShadowOffset } from "../../video-editor/properties/cursor/cursor-shadow";
import { cursorHotspotAtSize, cursorPositionAt, cursorTypeAt } from "../../video-editor/properties/cursor/cursor-rendering";

export type CompositionVisuals = ReadonlyMap<string, CanvasImageSource>;
export const OUTPUT_FALLBACK_COLOR = "#1e1e24";

type RenderableVideo = CanvasImageSource & { videoWidth?: number; videoHeight?: number; displayWidth?: number; displayHeight?: number };
const sourceDimensions = (source: CanvasImageSource) => {
  if (source instanceof HTMLVideoElement) return { width: source.videoWidth, height: source.videoHeight };
  if (source instanceof HTMLImageElement) return { width: source.naturalWidth, height: source.naturalHeight };
  if (typeof VideoFrame !== "undefined" && source instanceof VideoFrame) return { width: source.displayWidth, height: source.displayHeight };
  return { width: 0, height: 0 };
};

function drawSnapshotBackground(ctx: CanvasRenderingContext2D, snapshot: CompositionSnapshot, background: CanvasImageSource | null | undefined) {
  const { width, height } = snapshot.canvas;
  const value = snapshot.background;
  if (!value && !background) return;
  if (value?.kind === "color") {
    ctx.fillStyle = value.color;
    ctx.fillRect(0, 0, width, height);
    return;
  }
  if (value?.kind === "gradient") {
    const gradient = value.gradient.type === "radial"
      ? ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) / 2)
      : (() => {
          const radians = ((value.gradient.angle - 90) * Math.PI) / 180;
          const dx = Math.cos(radians) * width / 2;
          const dy = Math.sin(radians) * height / 2;
          return ctx.createLinearGradient(width / 2 - dx, height / 2 - dy, width / 2 + dx, height / 2 + dy);
        })();
    value.gradient.stops.forEach((stop) => gradient.addColorStop(stop.position, `${stop.color}${Math.round(stop.alpha * 255).toString(16).padStart(2, "0")}`));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    return;
  }
  if (!background) return;
  const blur = Math.min(48, snapshot.blurPercent * .48);
  ctx.save();
  if (blur > 0) {
    const overscan = blur * 2;
    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(background, -overscan, -overscan, width + overscan * 2, height + overscan * 2);
  } else ctx.drawImage(background, 0, 0, width, height);
  ctx.restore();
}

function drawCaption(ctx: CanvasRenderingContext2D, clip: CaptionClip, timeMs: number, window: { x: number; y: number; width: number; height: number }, referenceWidth: number) {
  const sentence = clip.caption.sentences.find((item) => item.startMs <= timeMs && timeMs <= item.endMs);
  const text = clip.caption.style.customText || sentence?.text;
  if (!text) return;
  const style = clip.caption.style;
  const transform = getCaptionTransform(clip);
  const box = {
    x: window.x + transform.x * window.width,
    y: window.y + transform.y * window.height,
    width: transform.width * window.width,
    height: transform.height * window.height,
  };
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const fontSize = Math.max(12, style.fontSize * window.width / Math.max(1, referenceWidth));
  const strokeWidth = Math.max(1, (style.boxPadding ?? 6) * window.width / Math.max(1, referenceWidth));
  const extrusion = Math.max(0, (style.boxRadius ?? 4) * window.width / Math.max(1, referenceWidth));
  ctx.save();
  ctx.font = `800 ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  if (style.shadowBlur > 0) {
    const blur = style.shadowBlur;
    const direction = style.shadowDirection ?? "bottom-right";
    ctx.shadowColor = style.shadowColor || "rgba(0,0,0,.85)";
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = style.shadowOffsetX ?? (direction === "top-left" ? -blur * .5 : direction === "bottom-right" ? blur * .5 : 0);
    ctx.shadowOffsetY = style.shadowOffsetY ?? (direction === "top-left" ? -blur * .5 : direction === "bottom" || direction === "bottom-right" ? blur * .5 : 0);
  }
  if (extrusion > 0) {
    ctx.save();
    ctx.strokeStyle = style.shadowColor || "rgba(0,0,0,.85)";
    ctx.fillStyle = style.shadowColor || "rgba(0,0,0,.85)";
    ctx.lineWidth = strokeWidth * 2;
    for (let step = Math.round(extrusion); step >= 1; step -= 1) {
      const offset = step * window.width / Math.max(1, referenceWidth);
      ctx.strokeText(text, centerX + offset, centerY + offset, Math.max(10, box.width - 8));
      ctx.fillText(text, centerX + offset, centerY + offset, Math.max(10, box.width - 8));
      ctx.shadowColor = "transparent";
    }
    ctx.restore();
    ctx.shadowColor = "transparent";
  }
  const outline = style.boxColor ?? "#000000";
  if (outline !== "transparent" && strokeWidth > 0) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = strokeWidth * 2;
    ctx.strokeText(text, centerX, centerY, Math.max(10, box.width - 8));
    ctx.shadowColor = "transparent";
  }
  ctx.fillStyle = style.color || "#ffffff";
  ctx.fillText(text, centerX, centerY, Math.max(10, box.width - 8));
  ctx.restore();
}

function drawVisualClip(ctx: CanvasRenderingContext2D, clip: VisualClip, source: CanvasImageSource, canvas: { width: number; height: number }, window?: { x: number; y: number; width: number; height: number }) {
  const target = window ?? { x: 0, y: 0, width: canvas.width, height: canvas.height };
  const { width: sourceWidth, height: sourceHeight } = sourceDimensions(source);
  const transform = clip.transform;
  const rect = {
    x: target.x + transform.x * target.width,
    y: target.y + transform.y * target.height,
    width: transform.width * target.width,
    height: transform.height * target.height,
  };
  drawDecoratedMedia(ctx, {
    source,
    sourceRect: clip.crop && sourceWidth > 0 && sourceHeight > 0 ? {
      x: clip.crop.x * sourceWidth,
      y: clip.crop.y * sourceHeight,
      width: clip.crop.width * sourceWidth,
      height: clip.crop.height * sourceHeight,
    } : undefined,
    rect,
    appearance: clip.appearance,
    title: clip.name,
    mirrored: clip.isMirrored,
  });
}

export function drawCompositionLayers(
  ctx: CanvasRenderingContext2D,
  snapshot: CompositionSnapshot,
  time: number,
  visuals: CompositionVisuals = new Map(),
  positionedMedia?: { x: number; y: number; width: number; height: number },
  mainVideoWidth = snapshot.video.width,
) {
  const timeMs = time * 1_000;
  const clips = activeClipsAt(snapshot.composition, timeMs).filter((clip) => clip.kind !== "screen").sort((a, b) => b.order - a.order);
  for (const clip of clips) {
    if (clip.kind === "caption") {
      drawCaption(ctx, clip, timeMs, positionedMedia ?? { x: 0, y: 0, width: snapshot.canvas.width, height: snapshot.canvas.height }, mainVideoWidth);
      continue;
    }
    if (!isVisualClip(clip) || clip.kind === "webcam") continue;
    const source = visuals.get(clip.assetId);
    if (source) drawVisualClip(ctx, clip, source, snapshot.canvas, positionedMedia);
  }
}

export function renderCompositionFrame(
  ctx: CanvasRenderingContext2D,
  video: RenderableVideo | null,
  snapshot: CompositionSnapshot,
  time: number,
  background?: CanvasImageSource | null,
  cursorImages?: ReadonlyMap<string, HTMLImageElement>,
  visuals?: CompositionVisuals,
) {
  const { width, height } = snapshot.canvas;
  ctx.fillStyle = OUTPUT_FALLBACK_COLOR;
  ctx.fillRect(0, 0, width, height);
  const timeMs = time * 1_000;
  const active = activeClipsAt(snapshot.composition, timeMs);
  const screen = active.find((clip): clip is VisualClip => clip.kind === "screen");
  if (!screen || !snapshot.video.enabled || !video || (video instanceof HTMLVideoElement && video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)) {
    drawSnapshotBackground(ctx, snapshot, background);
    drawCompositionLayers(ctx, snapshot, time, visuals);
    return;
  }

  const sourceWidth = video.videoWidth || video.displayWidth || snapshot.video.width;
  const sourceHeight = video.videoHeight || video.displayHeight || snapshot.video.height;
  const crop = screen.crop;
  const cropX = crop ? crop.x * sourceWidth : 0;
  const cropY = crop ? crop.y * sourceHeight : 0;
  const cropWidth = crop ? crop.width * sourceWidth : sourceWidth;
  const cropHeight = crop ? crop.height * sourceHeight : sourceHeight;
  const source = snapshot.canvas.showBackground
    ? { x: cropX, y: cropY, width: cropWidth, height: cropHeight }
    : coverSourceRect(cropWidth, cropHeight, width, height);
  if (!snapshot.canvas.showBackground) { source.x += cropX; source.y += cropY; }
  const media = snapshot.canvas.showBackground
    ? framedMediaRect(cropWidth, cropHeight, width, height)
    : { x: 0, y: 0, width, height };
  const positionedMedia = {
    x: media.x + screen.transform.x * media.width,
    y: media.y + screen.transform.y * media.height,
    width: media.width * screen.transform.width,
    height: media.height * screen.transform.height,
  };
  const zoom = zoomAtTime(snapshot.zooms, timeMs, snapshot.cursor.telemetry);
  const scale = zoom?.scale ?? 1;
  const focus = zoom?.focus ?? { cx: .5, cy: .5 };
  const outputFocus = zoom?.mode === "auto"
    ? outputPoint(focus.cx, focus.cy, sourceWidth, sourceHeight, width, height, snapshot.canvas.showBackground)
    : focus;
  const cameraFocus = clampFocusToScale(outputFocus, scale);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-cameraFocus.cx * width, -cameraFocus.cy * height);
  drawSnapshotBackground(ctx, snapshot, background);
  ctx.restore();

  const drawScreen = () => {
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-cameraFocus.cx * width, -cameraFocus.cy * height);
    drawDecoratedMedia(ctx, { source: video, sourceRect: source, rect: positionedMedia, appearance: screen.appearance, title: screen.name, mirrored: screen.isMirrored });
    ctx.restore();
  };

  const visualStack = active.filter((clip) => isVisualClip(clip)).sort((a, b) => b.order - a.order);
  for (const clip of visualStack) {
    if (clip.kind === "screen") {
      drawScreen();
      continue;
    }
    const sourceVisual = visuals?.get(clip.assetId);
    if (!sourceVisual) continue;
    if (clip.kind === "webcam") {
      drawWebcamOverlay(ctx, sourceVisual, width, height, scale, webcamSettingsForAppearance(clip.appearance, clip.isMirrored), clip.transform, clip.crop, clip.appearance, clip.name);
    } else drawVisualClip(ctx, clip, sourceVisual, snapshot.canvas, positionedMedia);
  }
  for (const clip of active) if (clip.kind === "caption") drawCaption(ctx, clip, timeMs, positionedMedia, sourceWidth);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-cameraFocus.cx * width, -cameraFocus.cy * height);
  const cursor = cursorStateAt(snapshot.cursor.events, time);
  const settings: CursorRenderSettings = snapshot.cursorSettings;
  if (settings.ripple.enabled) {
    for (const click of buttonEventsBetween(snapshot.cursor.events, Math.max(0, time - .5), time)) {
      const state = cursorStateAt(snapshot.cursor.events, click.sessionNs / 1_000_000_000);
      if (!state) continue;
      const position = cursorPositionAt(state, { width: sourceWidth, height: sourceHeight }, { x: 0, y: 0, width, height }, snapshot.canvas.showBackground, screen.transform, screen.isMirrored ?? false);
      const age = Math.max(0, time - click.sessionNs / 1_000_000_000);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / .5);
      ctx.strokeStyle = settings.ripple.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(position.x, position.y, 2 + age * settings.ripple.size * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  const cursorType = cursorTypeAt(settings.selectedCursor, cursor);
  const image = cursorImages?.get(cursorType);
  if (cursor?.visible && image?.complete && image.naturalWidth > 0) {
    const position = cursorPositionAt(cursor, { width: sourceWidth, height: sourceHeight }, { x: 0, y: 0, width, height }, snapshot.canvas.showBackground, screen.transform, screen.isMirrored ?? false);
    const hotspot = cursorHotspotAtSize(cursorType, settings.size);
    ctx.save();
    if (settings.shadow.enabled) {
      ctx.shadowColor = settings.shadow.color;
      ctx.shadowBlur = settings.shadow.blur;
      const offset = cursorShadowOffset(settings.shadow.blur, settings.shadow.direction);
      ctx.shadowOffsetX = offset.x;
      ctx.shadowOffsetY = offset.y;
    }
    const click = buttonEventsBetween(snapshot.cursor.events, Math.max(0, time - .28), time).at(-1);
    const age = click ? Math.max(0, time - click.sessionNs / 1_000_000_000) : Infinity;
    const clickScale = cursorClickSpringScale(age, settings.clickSpring.enabled);
    ctx.translate(position.x, position.y);
    ctx.scale(clickScale, clickScale);
    ctx.drawImage(image, -hotspot.x, -hotspot.y, settings.size, settings.size);
    ctx.restore();
  }
  ctx.restore();
}
