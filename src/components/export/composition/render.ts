import type { CompositionSnapshot } from '../export-types';
import {
  isBlurClip,
  isColorClip,
  type BlurClip,
  type CaptionClip,
  type VisualClip,
} from '~/media/shared/composition-types';
import {
  drawWebcamOverlay,
  webcamReactsToZoom,
  webcamSettingsForAppearance,
} from '../../video-editor/composition/webcam/webcam-zoom';
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
import { mapSourcePointToScreen, resolveScreenRenderGeometry } from '../../video-editor/composition/camera-layout';
import { resolveVisualClipFraming } from '../../video-editor/composition/visual-framing';
import { OUTPUT_FALLBACK_COLOR } from '../../video-editor/canvas/output-canvas';
import { createCameraMotionBlurPlan } from '../../video-editor/zoom/zoom-motion-blur';
import {
  compositeIsolatedMotionBlurSample,
  createMotionBlurSurface,
  resizeMotionBlurSurface,
  type MotionBlurSurface,
} from '../../video-editor/zoom/zoom-motion-blur-compositor';
import { normalizeZoomMotionBlur } from '../../video-editor/zoom/zoom-types';
import { sourceTimeAt } from '~/media/shared';
import { drawColorClip } from '../../video-editor/composition/color/render-color-clip';
import { hasPerspectiveTilt } from '../../video-editor/zoom/perspective-projection';
import { disposePerspectiveRenderer, renderPerspectiveLayers } from './perspective-render';
import { disposeCanvasTransitionSurface, getCanvasTransitionSurface } from './canvas-transition-surface';

export interface RenderableMedia {
  source: CanvasImageSource;
  width: number;
  height: number;
  preRendered?: boolean;
}

export type CompositionVisuals = ReadonlyMap<string, RenderableMedia>;
let zoomMotionBlurSurface: MotionBlurSurface | null = null;

const getZoomMotionBlurSurface = (width: number, height: number) => {
  zoomMotionBlurSurface ??= createMotionBlurSurface(width, height);
  if (zoomMotionBlurSurface) resizeMotionBlurSurface(zoomMotionBlurSurface, width, height);
  return zoomMotionBlurSurface;
};

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
  const { text, runs, wordHighlight } = captionContentAt(clip, timeMs);
  if (!text) return;
  const referenceCanvas = snapshot.referenceCanvas ?? snapshot.canvas;
  drawCaptionText(ctx, {
    clip,
    text,
    runs,
    wordHighlight,
    cursorPosition,
    canvas: referenceCanvas,
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
    shadowFollowsSourceAlpha: clip.kind === 'image',
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
      reactToZoom: webcamReactsToZoom(clip),
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
    if (isColorClip(clip)) {
      drawWithClipTransition(ctx, clip, timeMs, snapshot.canvas, () =>
        drawColorClip(ctx, clip, { x: 0, y: 0, width: snapshot.canvas.width, height: snapshot.canvas.height }),
      );
      continue;
    }
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
  const screenTime = screen ? (sourceTimeAt(screen, timeMs) ?? timeMs) / 1_000 : time;
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
  const blurSettings = normalizeZoomMotionBlur(snapshot.zoomMotionBlur);
  const blurIntensity = blurSettings.enabled ? blurSettings.intensity : 0;
  const blurPlan = createCameraMotionBlurPlan({
    sampleAt: (sampleTimeMs) => resolvedCameraEvaluator.sample(sampleTimeMs),
    center: camera,
    timeMs,
    intensity: blurIntensity,
    viewportWidth: width,
    viewportHeight: height,
  });
  const drawCameraSample = (target: Canvas2DContext, blurSample: (typeof blurPlan)[number]) => {
    const sampleCamera = blurSample.camera;
    target.save();
    target.translate(width / 2, height / 2);
    target.scale(sampleCamera.scale, sampleCamera.scale);
    target.translate(-sampleCamera.focusX * width, -sampleCamera.focusY * height);
    drawSnapshotBackground(target, snapshot, background);
    for (const clip of layers.visualStack) {
      if (clip.kind === 'screen') {
        if (!video || clip.id !== screen?.id || !positionedMedia || !source) continue;
        drawWithClipTransition(target, clip, timeMs, snapshot.canvas, () =>
          drawDecoratedMedia(target, {
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
      if (isColorClip(clip)) {
        drawWithClipTransition(target, clip, timeMs, snapshot.canvas, () =>
          drawColorClip(target, clip, { x: 0, y: 0, width, height }),
        );
        continue;
      }
      if (isBlurClip(clip)) {
        drawWithClipTransition(target, clip, timeMs, snapshot.canvas, () =>
          drawBlurClip(target, clip, snapshot.canvas),
        );
        continue;
      }
      const sourceVisual = visuals?.get(clip.id);
      if (!sourceVisual) continue;
      if (clip.kind === 'webcam')
        drawWithClipTransition(target, clip, timeMs, snapshot.canvas, () =>
          drawWebcamClip(target, clip, sourceVisual, snapshot.canvas, {
            scale: sampleCamera.scale,
            focusX: sampleCamera.focusX * width,
            focusY: sampleCamera.focusY * height,
          }),
        );
      else
        drawWithClipTransition(target, clip, timeMs, snapshot.canvas, () =>
          drawVisualClip(target, clip, sourceVisual, snapshot.canvas),
        );
    }
    target.restore();
  };
  const hasRenderableScreen = Boolean(screen && video && positionedMedia && source);
  const resolvedCursorMotionPlayer = hasRenderableScreen
    ? (cursorMotionPlayer ??
      createCursorMotionPlayer(snapshot.cursor.events, snapshot.cursorSettings.motion, sourceWidth, sourceHeight))
    : null;
  const cursorMotion = resolvedCursorMotionPlayer
    ? resolvedCursorMotionPlayer.sample(screenTime, cursorStateAt(snapshot.cursor.events, screenTime))
    : null;
  const keyboardCursorPosition =
    hasRenderableScreen && screen && resolvedCursorMotionPlayer
      ? cursorPositionForKeyboardCaption(
          snapshot,
          timeMs,
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
  const drawCameraLayers = (target: Canvas2DContext) => {
    if (blurPlan.length === 1) {
      drawCameraSample(target, blurPlan[0]!);
    } else {
      const surface = getZoomMotionBlurSurface(width, height);
      if (!surface) {
        drawCameraSample(target, blurPlan[Math.floor(blurPlan.length / 2)]!);
      } else {
        let accumulatedWeight = 0;
        let composited = false;
        for (const blurSample of blurPlan) {
          const rendered = compositeIsolatedMotionBlurSample({
            target,
            surface,
            logicalWidth: width,
            logicalHeight: height,
            pixelScale: 1,
            sample: blurSample,
            accumulatedWeight,
            draw: (sampleTarget, sampleToDraw) => drawCameraSample(sampleTarget, sampleToDraw),
          });
          if (rendered) {
            composited = true;
            accumulatedWeight += blurSample.weight;
          }
        }
        if (!composited) drawCameraSample(target, blurPlan[Math.floor(blurPlan.length / 2)]!);
      }
    }
    if (hasRenderableScreen && screen && resolvedCursorMotionPlayer) {
      target.save();
      target.translate(width / 2, height / 2);
      target.scale(scale, scale);
      target.translate(-cameraFocus.cx * width, -cameraFocus.cy * height);
      drawWithClipTransition(target, screen, timeMs, snapshot.canvas, () =>
        drawCursorLayer(
          target,
          snapshot,
          screenTime,
          screen,
          sourceWidth,
          sourceHeight,
          width,
          height,
          cursorImages,
          resolvedCursorMotionPlayer,
          cursorMotion,
        ),
      );
      target.restore();
    }
  };
  const perspective = { tiltX: camera.tiltX ?? 0, tiltY: camera.tiltY ?? 0 };
  if (hasPerspectiveTilt(perspective)) {
    renderPerspectiveLayers({
      target: ctx,
      width,
      height,
      transform: perspective,
      drawLayers: drawCameraLayers,
    });
  } else drawCameraLayers(ctx);
  for (const clip of layers.captions)
    drawWithClipTransition(ctx, clip, timeMs, snapshot.canvas, () =>
      drawCaption(ctx, clip, timeMs, snapshot, keyboardCursorPosition),
    );
  drawBeamWatermark(
    ctx,
    snapshot.canvas,
    { x: 0, y: 0, width: snapshot.canvas.width, height: snapshot.canvas.height },
    visuals?.get(WATERMARK_LOGO_KEY)?.source,
  );
}

export function disposeCompositionRenderer() {
  disposePerspectiveRenderer();
  zoomMotionBlurSurface = null;
  disposeCanvasTransitionSurface();
}

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
  const transitionTarget = transition
    ? getCanvasTransitionSurface(snapshot.canvas.width, snapshot.canvas.height)
    : null;
  if (!transition || !transitionTarget?.context) {
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
    transitionTarget.context,
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
    transitionTarget.surface,
    { width: snapshot.canvas.width, height: snapshot.canvas.height },
    { x: 0, y: 0, width: snapshot.canvas.width, height: snapshot.canvas.height },
    transition,
    OUTPUT_FALLBACK_COLOR,
  );
}
