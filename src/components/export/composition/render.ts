import type { CompositionSnapshot } from '../export-types';
import type { CaptionClip, VisualClip } from '~/media/shared/composition-types';
import { drawWebcamOverlay, webcamSettingsForAppearance } from '../../video-editor/composition/webcam/webcam-zoom';
import { coverSourceRect, framedMediaRect, outputPoint } from '../../video-editor/canvas/output-canvas';
import { drawDecoratedMedia } from '../../video-editor/composition/appearance/render-decorated-media';
import { createCursorMotionPlayer } from '../../video-editor/composables/cursor-motion';
import { cursorPositionForKeyboardCaption, drawCursorLayer } from './cursor-render';
import { captionContentAt } from '~/media/shared/caption-text-layout';
import { drawCaptionText } from '../../video-editor/composition/captions/render-caption-text';
import {
  createCompositionCameraEvaluator,
  type CompositionCameraEvaluator,
} from '../../video-editor/zoom/composition-camera';
import { renderBackground } from '../../video-editor/composition/background/render-background';
import { resolveCompositionSceneLayers } from '../../video-editor/composition/scene-layers';
import type { Canvas2DContext } from '~/types/canvas';

export interface RenderableMedia {
  source: CanvasImageSource;
  width: number;
  height: number;
}

export type CompositionVisuals = ReadonlyMap<string, RenderableMedia>;
export const OUTPUT_FALLBACK_COLOR = '#1e1e24';

function drawSnapshotBackground(
  ctx: Canvas2DContext,
  snapshot: CompositionSnapshot,
  background: RenderableMedia | null | undefined,
) {
  const value = snapshot.background;
  if (!value && !background) return;
  renderBackground(ctx, {
    value,
    source: background?.source,
    sourceSize: background ? { width: background.width, height: background.height } : undefined,
    rect: { x: 0, y: 0, width: snapshot.canvas.width, height: snapshot.canvas.height },
    blurPixels: snapshot.blurPercent * 0.48,
  });
}

function drawCaption(
  ctx: Canvas2DContext,
  clip: CaptionClip,
  timeMs: number,
  snapshot: CompositionSnapshot,
  cursorPosition?: { x: number; y: number } | null,
) {
  const { text, runs } = captionContentAt(clip, timeMs);
  if (!text) return;
  drawCaptionText(ctx, {
    clip,
    text,
    runs,
    cursorPosition,
    canvas: snapshot.canvas,
    viewport: { x: 0, y: 0, width: snapshot.canvas.width, height: snapshot.canvas.height },
  });
}

function drawVisualClip(
  ctx: Canvas2DContext,
  clip: VisualClip,
  media: RenderableMedia,
  canvas: { width: number; height: number },
) {
  const target = { x: 0, y: 0, width: canvas.width, height: canvas.height };
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
  ctx: Canvas2DContext,
  snapshot: CompositionSnapshot,
  time: number,
  visuals: CompositionVisuals = new Map(),
) {
  const timeMs = time * 1_000;
  const layers = resolveCompositionSceneLayers(snapshot.composition, timeMs);
  for (const clip of [...layers.viewportVisuals, ...layers.webcams]) {
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
    } else drawVisualClip(ctx, clip, media, snapshot.canvas);
  }
  for (const clip of layers.captions) drawCaption(ctx, clip, timeMs, snapshot);
}

export const createSnapshotCameraEvaluator = (
  snapshot: CompositionSnapshot,
  sourceWidth: number,
  sourceHeight: number,
): CompositionCameraEvaluator =>
  createCompositionCameraEvaluator({
    zooms: snapshot.zooms,
    telemetry: snapshot.cursor.telemetry,
    mapFocus: (focus, zoom) =>
      zoom.mode === 'auto'
        ? outputPoint(
            focus.cx,
            focus.cy,
            sourceWidth,
            sourceHeight,
            snapshot.canvas.width,
            snapshot.canvas.height,
            snapshot.canvas.showBackground,
          )
        : focus,
  });

export function renderCompositionFrame(
  ctx: Canvas2DContext,
  video: RenderableMedia | null,
  snapshot: CompositionSnapshot,
  time: number,
  background?: RenderableMedia | null,
  cursorImages?: ReadonlyMap<string, HTMLImageElement | ImageBitmap>,
  visuals?: CompositionVisuals,
  cursorMotionPlayer?: ReturnType<typeof createCursorMotionPlayer>,
  cameraEvaluator?: CompositionCameraEvaluator,
) {
  const { width, height } = snapshot.canvas;
  ctx.fillStyle = OUTPUT_FALLBACK_COLOR;
  ctx.fillRect(0, 0, width, height);
  const timeMs = time * 1_000;
  const layers = resolveCompositionSceneLayers(snapshot.composition, timeMs);
  const screen = layers.screen;
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
  const camera = (cameraEvaluator ?? createSnapshotCameraEvaluator(snapshot, sourceWidth, sourceHeight)).sample(timeMs);
  const scale = camera.scale;
  const cameraFocus = camera.focus;

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-cameraFocus.cx * width, -cameraFocus.cy * height);
  drawSnapshotBackground(ctx, snapshot, background);
  ctx.restore();

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-cameraFocus.cx * width, -cameraFocus.cy * height);
  for (const clip of layers.cameraVisuals) {
    if (clip.kind === 'screen') {
      drawDecoratedMedia(ctx, {
        source: video.source,
        sourceRect: source,
        rect: positionedMedia,
        appearance: screen.appearance,
        title: screen.name,
        mirrored: screen.isMirrored,
        mirroredY: screen.isMirroredY,
      });
      continue;
    }
    const sourceVisual = visuals?.get(clip.id);
    if (!sourceVisual) continue;
    drawVisualClip(ctx, clip, sourceVisual, snapshot.canvas);
  }
  ctx.restore();

  for (const clip of layers.viewportVisuals) {
    const sourceVisual = visuals?.get(clip.id);
    if (!sourceVisual) continue;
    drawVisualClip(ctx, clip, sourceVisual, snapshot.canvas);
  }

  for (const clip of layers.webcams) {
    const sourceVisual = visuals?.get(clip.id);
    if (!sourceVisual) continue;
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
  }
  const resolvedCursorMotionPlayer =
    cursorMotionPlayer ??
    createCursorMotionPlayer(snapshot.cursor.events, snapshot.cursorSettings.motion, sourceWidth, sourceHeight);
  const keyboardCursorPosition = cursorPositionForKeyboardCaption(
    snapshot,
    time,
    screen,
    sourceWidth,
    sourceHeight,
    width,
    height,
    cursorImages,
    resolvedCursorMotionPlayer,
    camera,
  );
  for (const clip of layers.captions) drawCaption(ctx, clip, timeMs, snapshot, keyboardCursorPosition);

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
    resolvedCursorMotionPlayer,
  );
  ctx.restore();
}
