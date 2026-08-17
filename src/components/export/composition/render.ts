import type { CompositionSnapshot } from '../export-types';
import { isBlurClip, type BlurClip, type CaptionClip, type VisualClip } from '~/media/shared/composition-types';
import { drawWebcamOverlay, webcamSettingsForAppearance } from '../../video-editor/composition/webcam/webcam-zoom';
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
import {
  resolveCompositionSceneLayers,
  type CompositionSceneLayers,
} from '../../video-editor/composition/scene-layers';
import type { Canvas2DContext } from '~/types/canvas';
import { applyBlurEffect } from '../../video-editor/composition/effects/blur-effect';
import { drawBeamWatermark, WATERMARK_LOGO_KEY } from '../../video-editor/canvas/watermark-render';
import { drawWithClipTransition } from '../../video-editor/composition/transitions/render-transition';
import { resolveFrameIntroTransition } from '~/media/shared/clip-transitions';
import { isSplitCameraLayout } from '~/media/shared/camera-layout-types';
import { mapSourcePointToScreen, resolveScreenRenderGeometry } from '../../video-editor/composition/camera-layout';

export interface RenderableMedia {
  source: CanvasImageSource;
  width: number;
  height: number;
  preRendered?: boolean;
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
  if (background?.preRendered) {
    ctx.drawImage(background.source, 0, 0, snapshot.canvas.width, snapshot.canvas.height);
    return;
  }
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

function drawBlurClip(ctx: Canvas2DContext, clip: BlurClip, canvas: { width: number; height: number }) {
  applyBlurEffect(ctx, clip, {
    x: clip.transform.x * canvas.width,
    y: clip.transform.y * canvas.height,
    width: clip.transform.width * canvas.width,
    height: clip.transform.height * canvas.height,
  });
}

function drawWebcamClip(
  ctx: Canvas2DContext,
  clip: VisualClip,
  media: RenderableMedia,
  canvas: { width: number; height: number },
  camera?: { scale: number; focusX: number; focusY: number },
) {
  const scale = camera?.scale || 1;
  ctx.save();
  if (camera) {
    ctx.translate(camera.focusX, camera.focusY);
    ctx.scale(1 / scale, 1 / scale);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
  }
  drawWebcamOverlay(
    ctx,
    media.source,
    { width: media.width, height: media.height },
    canvas.width,
    canvas.height,
    scale,
    {
      ...webcamSettingsForAppearance(clip.appearance, clip.isMirrored, clip.isMirroredY),
      reactToZoom: !isSplitCameraLayout(clip.cameraLayoutPreset ?? 'custom'),
    },
    clip.transform,
    clip.crop,
    clip.appearance,
    clip.name,
    1,
    clip.cameraFramingPreset ?? 'custom',
  );
  ctx.restore();
}

export function drawCompositionLayers(
  ctx: Canvas2DContext,
  snapshot: CompositionSnapshot,
  time: number,
  visuals: CompositionVisuals = new Map(),
) {
  const timeMs = time * 1_000;
  const layers = resolveCompositionSceneLayers(snapshot.composition, timeMs);
  const intro = resolveFrameIntroTransition(layers.visualStack, timeMs);
  for (const clip of layers.visualStack) {
    if (clip.kind === 'screen') continue;
    if (isBlurClip(clip)) {
      drawWithClipTransition(
        ctx,
        clip,
        timeMs,
        snapshot.canvas,
        () => drawBlurClip(ctx, clip, snapshot.canvas),
        intro?.clipId === clip.id,
      );
      continue;
    }
    const media = visuals.get(clip.id);
    if (!media) continue;
    if (clip.kind === 'webcam') {
      drawWithClipTransition(
        ctx,
        clip,
        timeMs,
        snapshot.canvas,
        () => drawWebcamClip(ctx, clip, media, snapshot.canvas),
        intro?.clipId === clip.id,
      );
    } else
      drawWithClipTransition(
        ctx,
        clip,
        timeMs,
        snapshot.canvas,
        () => drawVisualClip(ctx, clip, media, snapshot.canvas),
        intro?.clipId === clip.id,
      );
  }
  for (const clip of layers.captions)
    drawWithClipTransition(ctx, clip, timeMs, snapshot.canvas, () => drawCaption(ctx, clip, timeMs, snapshot));
}

export const createSnapshotCameraEvaluator = (
  snapshot: CompositionSnapshot,
  sourceWidth: number,
  sourceHeight: number,
): CompositionCameraEvaluator =>
  createCompositionCameraEvaluator({
    zooms: snapshot.zooms,
    telemetry: snapshot.cursor.telemetry,
    mapFocus: (focus, zoom, timeMs) => {
      const screen = resolveCompositionSceneLayers(snapshot.composition, timeMs).screen;
      if (zoom.mode !== 'auto' || !screen) return focus;
      const geometry = resolveScreenRenderGeometry(
        screen,
        sourceWidth,
        sourceHeight,
        snapshot.canvas.width,
        snapshot.canvas.height,
        snapshot.canvas.showBackground,
      );
      return mapSourcePointToScreen(
        focus,
        sourceWidth,
        sourceHeight,
        snapshot.canvas.width,
        snapshot.canvas.height,
        geometry,
      );
    },
  });

function renderCompositionFrameContent(
  ctx: Canvas2DContext,
  video: RenderableMedia | null,
  snapshot: CompositionSnapshot,
  time: number,
  background?: RenderableMedia | null,
  cursorImages?: ReadonlyMap<string, HTMLImageElement | ImageBitmap>,
  visuals?: CompositionVisuals,
  cursorMotionPlayer?: ReturnType<typeof createCursorMotionPlayer>,
  cameraEvaluator?: CompositionCameraEvaluator,
  resolvedLayers?: CompositionSceneLayers,
) {
  const { width, height } = snapshot.canvas;
  ctx.fillStyle = OUTPUT_FALLBACK_COLOR;
  ctx.fillRect(0, 0, width, height);
  const timeMs = time * 1_000;
  const layers = resolvedLayers ?? resolveCompositionSceneLayers(snapshot.composition, timeMs);
  const intro = resolveFrameIntroTransition(layers.visualStack, timeMs);
  const screen = layers.screen;
  const sourceWidth = video?.width ?? width;
  const sourceHeight = video?.height ?? height;
  const screenGeometry = screen
    ? resolveScreenRenderGeometry(screen, sourceWidth, sourceHeight, width, height, snapshot.canvas.showBackground)
    : null;
  const source = screenGeometry?.source;
  const positionedMedia = screenGeometry?.positioned ?? null;
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
  for (const clip of layers.visualStack) {
    if (clip.kind === 'screen') {
      if (!video || clip.id !== screen?.id || !positionedMedia || !source) continue;
      drawWithClipTransition(
        ctx,
        clip,
        timeMs,
        snapshot.canvas,
        () =>
          drawDecoratedMedia(ctx, {
            source: video.source,
            sourceRect: source,
            rect: positionedMedia,
            appearance: screen.appearance,
            title: screen.name,
            mirrored: screen.isMirrored,
            mirroredY: screen.isMirroredY,
          }),
        intro?.clipId === clip.id,
      );
      continue;
    }
    if (isBlurClip(clip)) {
      drawWithClipTransition(
        ctx,
        clip,
        timeMs,
        snapshot.canvas,
        () => drawBlurClip(ctx, clip, snapshot.canvas),
        intro?.clipId === clip.id,
      );
      continue;
    }
    const sourceVisual = visuals?.get(clip.id);
    if (!sourceVisual) continue;
    if (clip.kind === 'webcam')
      drawWithClipTransition(
        ctx,
        clip,
        timeMs,
        snapshot.canvas,
        () =>
          drawWebcamClip(ctx, clip, sourceVisual, snapshot.canvas, {
            scale,
            focusX: cameraFocus.cx * width,
            focusY: cameraFocus.cy * height,
          }),
        intro?.clipId === clip.id,
      );
    else
      drawWithClipTransition(
        ctx,
        clip,
        timeMs,
        snapshot.canvas,
        () => drawVisualClip(ctx, clip, sourceVisual, snapshot.canvas),
        intro?.clipId === clip.id,
      );
  }
  ctx.restore();
  const resolvedCursorMotionPlayer = screen
    ? (cursorMotionPlayer ??
      createCursorMotionPlayer(snapshot.cursor.events, snapshot.cursorSettings.motion, sourceWidth, sourceHeight))
    : null;
  const keyboardCursorPosition =
    screen && resolvedCursorMotionPlayer
      ? cursorPositionForKeyboardCaption(
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
        )
      : null;
  for (const clip of layers.captions)
    drawWithClipTransition(ctx, clip, timeMs, snapshot.canvas, () =>
      drawCaption(ctx, clip, timeMs, snapshot, keyboardCursorPosition),
    );

  if (screen && resolvedCursorMotionPlayer) {
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
  drawBeamWatermark(
    ctx,
    snapshot.canvas,
    { x: 0, y: 0, width: snapshot.canvas.width, height: snapshot.canvas.height },
    visuals?.get(WATERMARK_LOGO_KEY)?.source,
  );
}

let introSurface: OffscreenCanvas | HTMLCanvasElement | null = null;
const getIntroSurface = (width: number, height: number) => {
  if (!introSurface) {
    if (typeof OffscreenCanvas !== 'undefined') introSurface = new OffscreenCanvas(width, height);
    else if (typeof document !== 'undefined') introSurface = document.createElement('canvas');
  }
  if (!introSurface) return null;
  introSurface.width = width;
  introSurface.height = height;
  return introSurface;
};

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
  resolvedLayers?: CompositionSceneLayers,
) {
  const layers = resolvedLayers ?? resolveCompositionSceneLayers(snapshot.composition, time * 1_000);
  const intro = resolveFrameIntroTransition(layers.visualStack, time * 1_000);
  const surface = intro ? getIntroSurface(snapshot.canvas.width, snapshot.canvas.height) : null;
  const surfaceContext = surface?.getContext('2d') as Canvas2DContext | null | undefined;
  if (!intro || !surface || !surfaceContext) {
    renderCompositionFrameContent(
      ctx,
      video,
      snapshot,
      time,
      background,
      cursorImages,
      visuals,
      cursorMotionPlayer,
      cameraEvaluator,
      layers,
    );
    return;
  }
  renderCompositionFrameContent(
    surfaceContext,
    video,
    snapshot,
    time,
    background,
    cursorImages,
    visuals,
    cursorMotionPlayer,
    cameraEvaluator,
    layers,
  );
  ctx.save();
  ctx.fillStyle = OUTPUT_FALLBACK_COLOR;
  ctx.fillRect(0, 0, snapshot.canvas.width, snapshot.canvas.height);
  ctx.globalAlpha *= intro.state.opacity;
  ctx.translate(intro.state.translateX * snapshot.canvas.width, intro.state.translateY * snapshot.canvas.height);
  ctx.translate(snapshot.canvas.width / 2, snapshot.canvas.height / 2);
  ctx.scale(intro.state.scale, intro.state.scale);
  ctx.translate(-snapshot.canvas.width / 2, -snapshot.canvas.height / 2);
  if (intro.state.blur > 0) ctx.filter = `blur(${intro.state.blur * (snapshot.canvas.height / 1080)}px)`;
  ctx.drawImage(surface, 0, 0);
  ctx.restore();
}
