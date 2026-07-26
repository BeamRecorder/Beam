import { clampFocusToScale, zoomAtTime } from "../../video-editor/zoom/zoom-playback";
import {
  buttonEventsBetween,
  cursorStateAt,
} from "../../video-editor/composables/cursorPlayback";
import type {
  CompositionSnapshot,
  CursorRenderSettings,
} from "../export-types";
import { activeLayersAt, getCaptionTransform } from "../../video-editor/composition/composition-types";
import { drawWebcamOverlay, webcamSettingsForAppearance } from "../../video-editor/composition/webcam/webcam-zoom";
import { coverSourceRect, framedMediaRect, outputPoint } from '../../video-editor/canvas/output-canvas';
import { applyClipShadow, radiusForAppearance } from '../../video-editor/canvas/composables/useCompositionMedia';
import { cursorClickSpringScale } from '../../video-editor/composables/cursor-click-spring';
import { cursorShadowOffset } from '../../video-editor/properties/cursor/cursor-shadow';
import { cursorHotspotAtSize, cursorPositionAt, cursorTypeAt } from '../../video-editor/properties/cursor/cursor-rendering';

export type CompositionVisuals = ReadonlyMap<string, CanvasImageSource>;
export const OUTPUT_FALLBACK_COLOR = '#1e1e24';

type RenderableVideo = CanvasImageSource & { videoWidth?: number; videoHeight?: number; displayWidth?: number; displayHeight?: number };
const sourceDimensions = (source: CanvasImageSource) => {
  if (source instanceof HTMLVideoElement) return { width: source.videoWidth, height: source.videoHeight };
  if (source instanceof HTMLImageElement) return { width: source.naturalWidth, height: source.naturalHeight };
  if (typeof VideoFrame !== "undefined" && source instanceof VideoFrame) return { width: source.displayWidth, height: source.displayHeight };
  return { width: 0, height: 0 };
};

function drawSnapshotBackground(ctx: CanvasRenderingContext2D, snapshot: CompositionSnapshot, background: CanvasImageSource | null | undefined) {
  const { width, height } = snapshot.canvas; const value = snapshot.background;
  if (!value && !background) return;
  if (value?.kind === 'color') { ctx.fillStyle = value.color; ctx.fillRect(0, 0, width, height); return; }
  if (value?.kind === 'gradient') {
    const gradient = value.gradient.type === 'radial' ? ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) / 2) : (() => { const radians = (value.gradient.angle - 90) * Math.PI / 180; const dx = Math.cos(radians) * width / 2; const dy = Math.sin(radians) * height / 2; return ctx.createLinearGradient(width / 2 - dx, height / 2 - dy, width / 2 + dx, height / 2 + dy); })();
    value.gradient.stops.forEach((stop) => gradient.addColorStop(stop.position, `${stop.color}${Math.round(stop.alpha * 255).toString(16).padStart(2, '0')}`)); ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height); return;
  }
  if (!background) return;
  const blur = Math.min(48, snapshot.blurPercent * .48); ctx.save();
  if (blur > 0) { const overscan = blur * 2; ctx.filter = `blur(${blur}px)`; ctx.drawImage(background, -overscan, -overscan, width + overscan * 2, height + overscan * 2); }
  else ctx.drawImage(background, 0, 0, width, height);
  ctx.restore();
}

export function drawCompositionLayers(
  ctx: CanvasRenderingContext2D,
  snapshot: CompositionSnapshot,
  time: number,
  visuals: CompositionVisuals = new Map(),
  followsZoom = false,
  positionedMedia?: { x: number; y: number; width: number; height: number },
  mainVideoWidth?: number,
) {
  const { width, height } = snapshot.canvas;
  const pm = positionedMedia ?? { x: 0, y: 0, width, height };
  const refWidth = mainVideoWidth || snapshot.video.width || 1920;

  for (const layer of activeLayersAt(snapshot.composition, time * 1000)) {
    if (
      layer.kind === "audio" ||
      (layer.kind === 'video' && layer.reactToZoom) ||
      (followsZoom ? layer.kind !== 'video' : layer.kind === 'video')
    ) continue;

    if (layer.kind === "caption") {
      if (followsZoom) continue; // Captions DO NOT follow camera zoom; they render in unzoomed screen space overlay

      const sentence = layer.caption.sentences.find(
        (item) => item.startMs <= time * 1000 && time * 1000 <= item.endMs,
      );
      const textToDisplay = layer.caption.style.customText || sentence?.text;
      if (!textToDisplay) continue;

      const style = layer.caption.style;
      const fontSizePx = Math.max(
        12,
        (style.fontSize * pm.width) / Math.max(1, refWidth),
      );

      ctx.save();
      ctx.font = `800 ${fontSizePx}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;

      const liveTransform = getCaptionTransform(layer);
      const boxX = pm.x + liveTransform.x * pm.width;
      const boxY = pm.y + liveTransform.y * pm.height;
      const boxW = liveTransform.width * pm.width;
      const boxH = liveTransform.height * pm.height;
      const centerX = boxX + boxW / 2;
      const centerY = boxY + boxH / 2;

      const strokeWidthPx = Math.max(
        1,
        ((style.boxPadding ?? 6) * pm.width) / Math.max(1, refWidth),
      );
      const extrusionPx = Math.max(
        0,
        ((style.boxRadius ?? 4) * pm.width) / Math.max(1, refWidth),
      );

      const outlineColor = style.boxColor ?? "#000000";

      // 1. Drop Shadow
      const hasShadow = Boolean(style.shadowBlur && style.shadowBlur > 0);
      if (hasShadow) {
        const blur = style.shadowBlur!;
        const dir = style.shadowDirection ?? "bottom-right";
        ctx.shadowColor = style.shadowColor || "rgba(0, 0, 0, 0.85)";
        ctx.shadowBlur = blur;
        ctx.shadowOffsetX =
          style.shadowOffsetX ??
          (dir === "top-left"
            ? -blur * 0.5
            : dir === "bottom-right"
              ? blur * 0.5
              : 0);
        ctx.shadowOffsetY =
          style.shadowOffsetY ??
          (dir === "top-left"
            ? -blur * 0.5
            : dir === "bottom" || dir === "bottom-right"
              ? blur * 0.5
              : 0);
      }

      // 2. 3D Extrusion Shadow
      if (extrusionPx > 0) {
        ctx.save();
        const shadowCol = style.shadowColor || "rgba(0, 0, 0, 0.85)";
        ctx.strokeStyle = shadowCol;
        ctx.fillStyle = shadowCol;
        ctx.lineWidth = strokeWidthPx * 2;

        const totalSteps = Math.round(extrusionPx);
        for (let i = totalSteps; i >= 1; i--) {
          const stepOffset = i * (pm.width / Math.max(1, refWidth));
          if (i !== totalSteps) {
            ctx.shadowColor = "transparent";
          }
          ctx.strokeText(
            textToDisplay,
            centerX + stepOffset,
            centerY + stepOffset,
            Math.max(10, boxW - 8),
          );
          ctx.fillText(
            textToDisplay,
            centerX + stepOffset,
            centerY + stepOffset,
            Math.max(10, boxW - 8),
          );
        }
        ctx.restore();
        ctx.shadowColor = "transparent";
      }

      // 3. Thick Outline Stroke
      if (outlineColor && outlineColor !== "transparent" && strokeWidthPx > 0) {
        ctx.save();
        if (extrusionPx > 0) {
          ctx.shadowColor = "transparent";
        }
        ctx.strokeStyle = outlineColor;
        ctx.lineWidth = strokeWidthPx * 2;
        ctx.strokeText(
          textToDisplay,
          centerX,
          centerY,
          Math.max(10, boxW - 8),
        );
        ctx.restore();
        ctx.shadowColor = "transparent";
      }

      // 4. Main Text Fill
      if (extrusionPx > 0 || (outlineColor && outlineColor !== "transparent" && strokeWidthPx > 0)) {
        ctx.shadowColor = "transparent";
      }
      ctx.fillStyle = style.color || "#ffffff";
      ctx.fillText(textToDisplay, centerX, centerY, Math.max(10, boxW - 8));
      ctx.restore();
      continue;
    }

    const asset = visuals.get(layer.assetId);
    if (!asset) continue;
    const transform = layer.transform ?? { x: 0, y: 0, width: 1, height: 1 };
    const { width: sourceWidth, height: sourceHeight } = sourceDimensions(asset);
    const dx = transform.x * width;
    const dy = transform.y * height;
    const dw = transform.width * width;
    const dh = transform.height * height;
    ctx.save();
    applyClipShadow(ctx, layer.appearance, dw);
    ctx.fillStyle = "rgba(0, 0, 0, 0.01)";
    ctx.beginPath();
    ctx.roundRect(dx, dy, dw, dh, Math.min(radiusForAppearance(layer.appearance), dw / 2, dh / 2));
    ctx.fill();
    ctx.clip();
    if (layer.isMirrored) {
      ctx.translate(dx * 2 + dw, 0);
      ctx.scale(-1, 1);
    }
    if (layer.crop && sourceWidth > 0 && sourceHeight > 0) ctx.drawImage(asset, layer.crop.x * sourceWidth, layer.crop.y * sourceHeight, layer.crop.width * sourceWidth, layer.crop.height * sourceHeight, dx, dy, dw, dh);
    else ctx.drawImage(asset, dx, dy, dw, dh);
    ctx.restore();
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
  if (
    !snapshot.video.enabled || !video ||
    (video instanceof HTMLVideoElement && video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
  ) {
    drawSnapshotBackground(ctx, snapshot, background);
    drawCompositionLayers(ctx, snapshot, time, visuals, true);
    drawCompositionLayers(ctx, snapshot, time, visuals);
    return;
  }
  const zoom = zoomAtTime(
    snapshot.zooms,
    time * 1000,
    snapshot.cursor.telemetry,
  );
  const scale = zoom?.scale ?? 1;
  const focus = zoom?.focus ?? { cx: 0.5, cy: 0.5 };
  const sourceWidth = video.videoWidth || video.displayWidth || snapshot.video.width;
  const sourceHeight = video.videoHeight || video.displayHeight || snapshot.video.height;
  const crop = snapshot.composition.baseVideoCrop;
  const cropX = crop ? crop.x * sourceWidth : 0;
  const cropY = crop ? crop.y * sourceHeight : 0;
  const cropWidth = crop ? crop.width * sourceWidth : sourceWidth;
  const cropHeight = crop ? crop.height * sourceHeight : sourceHeight;
  const source = snapshot.canvas.showBackground
    ? { x: cropX, y: cropY, width: cropWidth, height: cropHeight }
    : coverSourceRect(cropWidth, cropHeight, width, height);
  if (!snapshot.canvas.showBackground) {
    source.x += cropX;
    source.y += cropY;
  }
  const media = snapshot.canvas.showBackground ? framedMediaRect(cropWidth, cropHeight, width, height) : { x: 0, y: 0, width, height };
  const baseTransform = snapshot.composition.baseVideoTransform ?? { x: 0, y: 0, width: 1, height: 1 };
  const positionedMedia = {
    x: media.x + baseTransform.x * media.width,
    y: media.y + baseTransform.y * media.height,
    width: media.width * baseTransform.width,
    height: media.height * baseTransform.height,
  };
  const outputFocus = zoom?.mode === 'auto' ? outputPoint(focus.cx, focus.cy, sourceWidth, sourceHeight, width, height, snapshot.canvas.showBackground) : focus;
  const cameraFocus = clampFocusToScale(outputFocus, scale);
  const isBaseVideoMirrored = snapshot.composition.baseVideoIsMirrored ?? false;
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-cameraFocus.cx * width, -cameraFocus.cy * height);
  drawSnapshotBackground(ctx, snapshot, background);
  applyClipShadow(ctx, snapshot.composition.baseVideoAppearance, positionedMedia.width);
  ctx.beginPath();
  ctx.roundRect(positionedMedia.x, positionedMedia.y, positionedMedia.width, positionedMedia.height, Math.min(radiusForAppearance(snapshot.composition.baseVideoAppearance), positionedMedia.width / 2, positionedMedia.height / 2));
  ctx.clip();
  if (isBaseVideoMirrored) {
    ctx.save();
    ctx.translate(positionedMedia.x * 2 + positionedMedia.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, source.x, source.y, source.width, source.height, positionedMedia.x, positionedMedia.y, positionedMedia.width, positionedMedia.height);
    ctx.restore();
  } else {
    ctx.drawImage(video, source.x, source.y, source.width, source.height, positionedMedia.x, positionedMedia.y, positionedMedia.width, positionedMedia.height);
  }
  drawCompositionLayers(ctx, snapshot, time, visuals, true, positionedMedia, sourceWidth);
  ctx.restore();

  for (const layer of activeLayersAt(snapshot.composition, time * 1000)) {
    if (layer.kind !== "video" || !layer.reactToZoom) continue;
    const source = visuals?.get(layer.assetId);
    if (source) drawWebcamOverlay(ctx, source, width, height, scale, webcamSettingsForAppearance(layer.appearance ?? layer.webcamAppearance, layer.isMirrored), layer.transform, layer.crop);
  }
  drawCompositionLayers(ctx, snapshot, time, visuals, false, positionedMedia, sourceWidth);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-cameraFocus.cx * width, -cameraFocus.cy * height);
  const cursor = cursorStateAt(snapshot.cursor.events, time);
  const settings: CursorRenderSettings = snapshot.cursorSettings;
  if (settings.ripple.enabled) {
    for (const click of buttonEventsBetween(
      snapshot.cursor.events,
      Math.max(0, time - 0.5),
      time,
    )) {
      const state = cursorStateAt(
        snapshot.cursor.events,
        click.sessionNs / 1_000_000_000,
      );
      if (!state) continue;
      const position = cursorPositionAt(
        state,
        { width: sourceWidth, height: sourceHeight },
        { x: 0, y: 0, width, height },
        snapshot.canvas.showBackground,
        baseTransform,
        isBaseVideoMirrored,
      );

      const age = Math.max(0, time - click.sessionNs / 1_000_000_000);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / 0.5);
      ctx.strokeStyle = settings.ripple.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        position.x,
        position.y,
        2 + age * settings.ripple.size * 2,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.restore();
    }
  }
  const cursorType = cursorTypeAt(settings.selectedCursor, cursor);
  const image = cursorImages?.get(cursorType);
  if (cursor?.visible && image?.complete && image.naturalWidth > 0) {
    const position = cursorPositionAt(
      cursor,
      { width: sourceWidth, height: sourceHeight },
      { x: 0, y: 0, width, height },
      snapshot.canvas.showBackground,
      baseTransform,
      isBaseVideoMirrored,
    );
    const size = settings.size;
    const hotspot = cursorHotspotAtSize(cursorType, size);

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
    ctx.drawImage(
      image,
      -hotspot.x,
      -hotspot.y,
      size,
      size,
    );
    ctx.restore();
  }
  ctx.restore();
}
