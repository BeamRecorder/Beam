import type { Canvas2DContext } from '../canvas-types';
import type { ScreenshotZoomLayer } from '@beam/engine/screenshot/screenshot-types';
import { manualCameraZoom } from '@beam/engine/zoom/manual-zoom';
import { renderGlassHighlights, disposeGlassHighlights } from '../rendering/glass-highlight-render';
import type { GlassScenePainter } from '../zoom/glass-highlight-gpu-types';
import { renderPerspectiveLayers } from '../rendering/perspective-render';
import { createGlassCanvas } from '../zoom/glass-highlight-gpu';
import { hasPerspectiveTilt } from '@beam/engine/zoom/perspective-projection';
import type { OutputCanvasSettings } from '@beam/engine/layout/output-canvas';
import type { MediaRect } from '@beam/engine/shared/geometry-types';
import { perspectiveSourceRaster } from '../zoom/perspective-source';

const surfaces = new WeakMap<Canvas2DContext, ReturnType<typeof createGlassCanvas>>();

/** Zoom layers affect the composition beneath them, using the video's lens and projection backends. */
export function drawScreenshotZoom(
  target: Canvas2DContext,
  zoom: ScreenshotZoomLayer,
  canvas: OutputCanvasSettings,
  width: number,
  height: number,
  backdrop: CanvasImageSource,
  drawScene?: GlassScenePainter,
  drawBackground?: GlassScenePainter['draw'],
  sourceBounds: MediaRect = { x: 0, y: 0, width, height },
) {
  if (zoom.effect === 'glass') {
    renderGlassHighlights(
      target,
      { canvas: { ...canvas, width, height }, zooms: [{ ...zoom, glass: { ...zoom.glass!, transitionMs: 0 } }] },
      0.5,
      backdrop,
      drawScene,
    );
    return;
  }
  const completePlane = zoom.projection === 'orbit' && drawScene;
  const camera = manualCameraZoom(zoom);
  const viewport = { x: 0, y: 0, width, height };
  const { bounds, size } = completePlane
    ? perspectiveSourceRaster(
        sourceBounds,
        viewport,
        { scale: camera.scale, focusX: camera.focus.cx, focusY: camera.focus.cy },
        1,
        8192,
      )
    : { bounds: viewport, size: { width, height } };
  let source = surfaces.get(target);
  if (!source) {
    source = createGlassCanvas(size.width, size.height);
    surfaces.set(target, source);
  }
  if (source.width !== size.width) source.width = size.width;
  if (source.height !== size.height) source.height = size.height;
  const capture = source.getContext('2d') as Canvas2DContext | null;
  if (!capture) throw new Error('Screenshot zoom source surface unavailable.');
  capture.setTransform(1, 0, 0, 1, 0, 0);
  capture.clearRect(0, 0, size.width, size.height);
  if (completePlane) {
    capture.save();
    capture.setTransform(
      size.width / bounds.width,
      0,
      0,
      size.height / bounds.height,
      (-bounds.x * size.width) / bounds.width,
      (-bounds.y * size.height) / bounds.height,
    );
    drawScene.draw(capture, width, height);
    capture.restore();
  } else capture.drawImage(backdrop, 0, 0, size.width, size.height);
  const draw = (ctx: Canvas2DContext) => {
    ctx.save();
    if (!completePlane) {
      ctx.translate(width / 2, height / 2);
      ctx.scale(camera.scale, camera.scale);
      ctx.translate(-camera.focus.cx * width, -camera.focus.cy * height);
    }
    ctx.drawImage(source!, bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.restore();
  };
  target.clearRect(0, 0, width, height);
  if (zoom.projection === 'orbit') drawBackground?.(target, width, height);
  if (completePlane || hasPerspectiveTilt(camera))
    renderPerspectiveLayers({
      target,
      width,
      height,
      transform: camera,
      drawLayers: draw,
      ...(completePlane
        ? { camera: { scale: camera.scale, focusX: camera.focus.cx, focusY: camera.focus.cy }, sourceBounds: bounds }
        : {}),
    });
  else draw(target);
}

export function disposeScreenshotZoom(target: Canvas2DContext) {
  disposeGlassHighlights(target);
  const surface = surfaces.get(target);
  if (surface) surface.width = surface.height = 0;
  surfaces.delete(target);
}
