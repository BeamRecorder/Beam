import { clampFocusToScale, zoomAtTime } from '../../video-editor/zoom/zoom-playback';
import type { CompositionSnapshot } from '../export-types';
import { activeClipsAt } from '~/media/shared';
import { isVisualClip, type CaptionClip, type VisualClip } from '~/media/shared/composition-types';
import { drawWebcamOverlay, webcamSettingsForAppearance } from '../../video-editor/composition/webcam/webcam-zoom';
import { coverSourceRect, framedMediaRect, outputPoint } from '../../video-editor/canvas/output-canvas';
import { drawDecoratedMedia } from '../../video-editor/composition/appearance/render-decorated-media';
import { createCursorMotionPlayer } from '../../video-editor/composables/cursor-motion';
import { drawCursorLayer } from './cursor-render';
import { captionTextAt } from '~/media/shared/caption-text-layout';
import { drawCaptionText } from '../../video-editor/composition/captions/render-caption-text';

export interface RenderableMedia {
  source: CanvasImageSource;
  width: number;
  height: number;
}

export type CompositionVisuals = ReadonlyMap<string, RenderableMedia>;
export const OUTPUT_FALLBACK_COLOR = '#1e1e24';

function drawSnapshotBackground(
  ctx: CanvasRenderingContext2D,
  snapshot: CompositionSnapshot,
  background: RenderableMedia | null | undefined,
) {
  const { width, height } = snapshot.canvas;
  const value = snapshot.background;
  if (!value && !background) return;
  if (value?.kind === 'color') {
    ctx.fillStyle = value.color;
    ctx.fillRect(0, 0, width, height);
    return;
  }
  if (value?.kind === 'gradient') {
    const gradient =
      value.gradient.type === 'radial'
        ? ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) / 2)
        : (() => {
            const radians = ((value.gradient.angle - 90) * Math.PI) / 180;
            const dx = (Math.cos(radians) * width) / 2;
            const dy = (Math.sin(radians) * height) / 2;
            return ctx.createLinearGradient(width / 2 - dx, height / 2 - dy, width / 2 + dx, height / 2 + dy);
          })();
    value.gradient.stops.forEach((stop) =>
      gradient.addColorStop(
        stop.position,
        `${stop.color}${Math.round(stop.alpha * 255)
          .toString(16)
          .padStart(2, '0')}`,
      ),
    );
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    return;
  }
  if (!background) return;
  const blur = Math.min(48, snapshot.blurPercent * 0.48);
  ctx.save();
  if (blur > 0) {
    const overscan = blur * 2;
    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(background.source, -overscan, -overscan, width + overscan * 2, height + overscan * 2);
  } else ctx.drawImage(background.source, 0, 0, width, height);
  ctx.restore();
}

function drawCaption(ctx: CanvasRenderingContext2D, clip: CaptionClip, timeMs: number, snapshot: CompositionSnapshot) {
  const text = captionTextAt(clip, timeMs);
  if (!text) return;
  drawCaptionText(ctx, {
    clip,
    text,
    canvas: snapshot.canvas,
    viewport: { x: 0, y: 0, width: snapshot.canvas.width, height: snapshot.canvas.height },
  });
}

function drawVisualClip(
  ctx: CanvasRenderingContext2D,
  clip: VisualClip,
  media: RenderableMedia,
  canvas: { width: number; height: number },
  window?: { x: number; y: number; width: number; height: number },
) {
  const target = window ?? {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
  };
  const { source, width: sourceWidth, height: sourceHeight } = media;
  const transform = clip.transform;
  const rect = {
    x: target.x + transform.x * target.width,
    y: target.y + transform.y * target.height,
    width: transform.width * target.width,
    height: transform.height * target.height,
  };
  drawDecoratedMedia(ctx, {
    source,
    sourceRect:
      clip.crop && sourceWidth > 0 && sourceHeight > 0
        ? {
            x: clip.crop.x * sourceWidth,
            y: clip.crop.y * sourceHeight,
            width: clip.crop.width * sourceWidth,
            height: clip.crop.height * sourceHeight,
          }
        : undefined,
    rect,
    appearance: clip.appearance,
    title: clip.name,
    mirrored: clip.isMirrored,
    mirroredY: clip.isMirroredY,
  });
}

export function drawCompositionLayers(
  ctx: CanvasRenderingContext2D,
  snapshot: CompositionSnapshot,
  time: number,
  visuals: CompositionVisuals = new Map(),
  positionedMedia?: { x: number; y: number; width: number; height: number },
) {
  const timeMs = time * 1_000;
  const clips = activeClipsAt(snapshot.composition, timeMs)
    .filter((clip) => clip.kind !== 'screen')
    .sort((a, b) => b.order - a.order);
  for (const clip of clips) {
    if (clip.kind === 'caption') {
      drawCaption(ctx, clip, timeMs, snapshot);
      continue;
    }
    if (!isVisualClip(clip)) continue;
    const media = visuals.get(clip.id);
    if (!media) continue;
    if (clip.kind === 'webcam') {
      drawWebcamOverlay(
        ctx,
        media.source,
        { width: media.width, height: media.height },
        snapshot.canvas.width,
        snapshot.canvas.height,
        1,
        webcamSettingsForAppearance(clip.appearance, clip.isMirrored, clip.isMirroredY),
        clip.transform,
        clip.crop,
        clip.appearance,
        clip.name,
      );
    } else drawVisualClip(ctx, clip, media, snapshot.canvas, positionedMedia);
  }
}

export function renderCompositionFrame(
  ctx: CanvasRenderingContext2D,
  video: RenderableMedia | null,
  snapshot: CompositionSnapshot,
  time: number,
  background?: RenderableMedia | null,
  cursorImages?: ReadonlyMap<string, HTMLImageElement>,
  visuals?: CompositionVisuals,
  cursorMotionPlayer?: ReturnType<typeof createCursorMotionPlayer>,
) {
  const { width, height } = snapshot.canvas;
  ctx.fillStyle = OUTPUT_FALLBACK_COLOR;
  ctx.fillRect(0, 0, width, height);
  const timeMs = time * 1_000;
  const active = activeClipsAt(snapshot.composition, timeMs);
  const screen = active.find((clip): clip is VisualClip => clip.kind === 'screen');
  if (!screen || !video) {
    drawSnapshotBackground(ctx, snapshot, background);
    drawCompositionLayers(ctx, snapshot, time, visuals);
    return;
  }

  const sourceWidth = video.width;
  const sourceHeight = video.height;
  const crop = screen.crop;
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
  const focus = zoom?.focus ?? { cx: 0.5, cy: 0.5 };
  const outputFocus =
    zoom?.mode === 'auto'
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
    drawDecoratedMedia(ctx, {
      source: video.source,
      sourceRect: source,
      rect: positionedMedia,
      appearance: screen.appearance,
      title: screen.name,
      mirrored: screen.isMirrored,
      mirroredY: screen.isMirroredY,
    });
    ctx.restore();
  };

  const visualStack = active.filter((clip) => isVisualClip(clip)).sort((a, b) => b.order - a.order);
  for (const clip of visualStack) {
    if (clip.kind === 'screen') {
      drawScreen();
      continue;
    }
    const sourceVisual = visuals?.get(clip.id);
    if (!sourceVisual) continue;
    if (clip.kind === 'webcam') {
      drawWebcamOverlay(
        ctx,
        sourceVisual.source,
        { width: sourceVisual.width, height: sourceVisual.height },
        width,
        height,
        scale,
        webcamSettingsForAppearance(clip.appearance, clip.isMirrored, clip.isMirroredY),
        clip.transform,
        clip.crop,
        clip.appearance,
        clip.name,
      );
    } else drawVisualClip(ctx, clip, sourceVisual, snapshot.canvas, positionedMedia);
  }
  for (const clip of active) if (clip.kind === 'caption') drawCaption(ctx, clip, timeMs, snapshot);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-cameraFocus.cx * width, -cameraFocus.cy * height);
  drawCursorLayer(
    ctx,
    snapshot,
    time,
    screen,
    sourceWidth,
    sourceHeight,
    width,
    height,
    cursorImages,
    cursorMotionPlayer ??
      createCursorMotionPlayer(snapshot.cursor.events, snapshot.cursorSettings.motion, sourceWidth, sourceHeight),
  );
  ctx.restore();
}
