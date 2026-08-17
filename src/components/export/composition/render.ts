import type { CompositionSnapshot } from '../export-types';
import { isBlurClip, type BlurClip, type CaptionClip, type VisualClip } from '~/media/shared/composition-types';
import { drawWebcamOverlay, webcamSettingsForAppearance } from '../../video-editor/composition/webcam/webcam-zoom';
import { drawDecoratedMedia } from '../../video-editor/composition/appearance/render-decorated-media';
import { createCursorMotionPlayer } from '../../video-editor/composables/cursor-motion';
import { cursorStateAt } from '../../video-editor/composables/cursorPlayback';
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
import { EMPTY_CLIP_TRANSITIONS, resolveCanvasTransitionState } from '~/media/shared/clip-transitions';
import { drawCanvasTransitionFrame } from '../../video-editor/composition/transitions/render-canvas-transition';
import { isSplitCameraLayout } from '~/media/shared/camera-layout-types';
import { mapSourcePointToScreen, resolveScreenRenderGeometry } from '../../video-editor/composition/camera-layout';
import { resolveVisualClipFraming } from '../../video-editor/composition/visual-framing';
import { OUTPUT_FALLBACK_COLOR } from '../../video-editor/canvas/output-canvas';
import {
  createZoomMotionBlurSamplePlan,
  sourceOverAlpha,
  ZOOM_MOTION_BLUR_SHUTTER_MS,
} from '../../video-editor/zoom/zoom-motion-blur';
import { normalizeZoomMotionBlur } from '../../video-editor/zoom/zoom-types';

export interface RenderableMedia {
  source: CanvasImageSource;
  width: number;
  height: number;
  preRendered?: boolean;
}

export type CompositionVisuals = ReadonlyMap<string, RenderableMedia>;
export { OUTPUT_FALLBACK_COLOR } from '../../video-editor/canvas/output-canvas';

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
  const framing = resolveVisualClipFraming(clip, rect, sourceWidth, sourceHeight);
  drawDecoratedMedia(ctx, {
    source,
    sourceRect: framing.sourceRect,
    rect: framing.rect,
    appearance: clip.appearance,
    title: clip.name,
    mirrored: clip.isMirrored,
    mirroredY: clip.isMirroredY,
    mask: framing.mask,
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
  for (const clip of layers.visualStack) {
    if (clip.kind === 'screen') continue;
    if (isBlurClip(clip)) {
      drawWithClipTransition(ctx, clip, timeMs, snapshot.canvas, () => drawBlurClip(ctx, clip, snapshot.canvas));
      continue;
    }
    const media = visuals.get(clip.id);
    if (!media) continue;
    if (clip.kind === 'webcam') {
      drawWithClipTransition(ctx, clip, timeMs, snapshot.canvas, () =>
        drawWebcamClip(ctx, clip, media, snapshot.canvas),
      );
    } else
      drawWithClipTransition(ctx, clip, timeMs, snapshot.canvas, () =>
        drawVisualClip(ctx, clip, media, snapshot.canvas),
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
  const screen = layers.screen;
  const sourceWidth = video?.width ?? width;
  const sourceHeight = video?.height ?? height;
  const screenGeometry = screen
    ? resolveScreenRenderGeometry(screen, sourceWidth, sourceHeight, width, height, snapshot.canvas.showBackground)
    : null;
  const source = screenGeometry?.source;
  const positionedMedia = screenGeometry?.positioned ?? null;
  const resolvedCameraEvaluator = cameraEvaluator ?? createSnapshotCameraEvaluator(snapshot, sourceWidth, sourceHeight);
  const camera = resolvedCameraEvaluator.sample(timeMs);
  const scale = camera.scale;
  const cameraFocus = camera.focus;
  const halfShutterMs = ZOOM_MOTION_BLUR_SHUTTER_MS / 2;
  const cameraAt = (sampleTimeMs: number) => {
    const value = resolvedCameraEvaluator.sample(Math.max(0, sampleTimeMs));
    return { focusX: value.focus.cx, focusY: value.focus.cy, scale: value.scale };
  };
  const blurSettings = normalizeZoomMotionBlur(snapshot.zoomMotionBlur);
  const blurPlan = createZoomMotionBlurSamplePlan({
    previous: cameraAt(timeMs - halfShutterMs),
    center: { focusX: cameraFocus.cx, focusY: cameraFocus.cy, scale },
    current: cameraAt(timeMs + halfShutterMs),
    intensity: blurSettings.enabled ? blurSettings.intensity : 0,
    deltaMs: halfShutterMs * 2,
  });
  let accumulatedWeight = 0;
  for (const blurSample of blurPlan) {
    const sampleCamera = blurSample.camera;
    ctx.save();
    ctx.globalAlpha = sourceOverAlpha(blurSample.weight, accumulatedWeight);
    accumulatedWeight += blurSample.weight;
    ctx.translate(width / 2, height / 2);
    ctx.scale(sampleCamera.scale, sampleCamera.scale);
    ctx.translate(-sampleCamera.focusX * width, -sampleCamera.focusY * height);
    drawSnapshotBackground(ctx, snapshot, background);
    for (const clip of layers.visualStack) {
      if (clip.kind === 'screen') {
        if (!video || clip.id !== screen?.id || !positionedMedia || !source) continue;
        drawWithClipTransition(ctx, clip, timeMs, snapshot.canvas, () =>
          drawDecoratedMedia(ctx, {
            source: video.source,
            sourceRect: source,
            rect: positionedMedia,
            appearance: screen.appearance,
            title: screen.name,
            mirrored: screen.isMirrored,
            mirroredY: screen.isMirroredY,
            mask: screenGeometry?.mask,
          }),
        );
        continue;
      }
      if (isBlurClip(clip)) {
        drawWithClipTransition(ctx, clip, timeMs, snapshot.canvas, () => drawBlurClip(ctx, clip, snapshot.canvas));
        continue;
      }
      const sourceVisual = visuals?.get(clip.id);
      if (!sourceVisual) continue;
      if (clip.kind === 'webcam')
        drawWithClipTransition(ctx, clip, timeMs, snapshot.canvas, () =>
          drawWebcamClip(ctx, clip, sourceVisual, snapshot.canvas, {
            scale: sampleCamera.scale,
            focusX: sampleCamera.focusX * width,
            focusY: sampleCamera.focusY * height,
          }),
        );
      else
        drawWithClipTransition(ctx, clip, timeMs, snapshot.canvas, () =>
          drawVisualClip(ctx, clip, sourceVisual, snapshot.canvas),
        );
    }
    ctx.restore();
  }
  const resolvedCursorMotionPlayer = screen
    ? (cursorMotionPlayer ??
      createCursorMotionPlayer(snapshot.cursor.events, snapshot.cursorSettings.motion, sourceWidth, sourceHeight))
    : null;
  const cursorMotion = resolvedCursorMotionPlayer
    ? resolvedCursorMotionPlayer.sample(time, cursorStateAt(snapshot.cursor.events, time))
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
          cursorMotion,
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
      cursorMotion,
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

let canvasTransitionSurface: OffscreenCanvas | HTMLCanvasElement | null = null;
const getCanvasTransitionSurface = (width: number, height: number) => {
  if (!canvasTransitionSurface) {
    if (typeof OffscreenCanvas !== 'undefined') canvasTransitionSurface = new OffscreenCanvas(width, height);
    else if (typeof document !== 'undefined') canvasTransitionSurface = document.createElement('canvas');
  }
  if (!canvasTransitionSurface) return null;
  canvasTransitionSurface.width = width;
  canvasTransitionSurface.height = height;
  return canvasTransitionSurface;
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
  const transition = resolveCanvasTransitionState(
    snapshot.canvas.transitions ?? EMPTY_CLIP_TRANSITIONS,
    time * 1_000,
    snapshot.duration * 1_000,
  );
  const surface = transition ? getCanvasTransitionSurface(snapshot.canvas.width, snapshot.canvas.height) : null;
  const surfaceContext = surface?.getContext('2d') as Canvas2DContext | null | undefined;
  if (!transition || !surface || !surfaceContext) {
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
  drawCanvasTransitionFrame(
    ctx,
    surface,
    { width: snapshot.canvas.width, height: snapshot.canvas.height },
    { x: 0, y: 0, width: snapshot.canvas.width, height: snapshot.canvas.height },
    transition,
    OUTPUT_FALLBACK_COLOR,
  );
}
