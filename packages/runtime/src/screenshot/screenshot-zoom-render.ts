import type { Canvas2DContext } from '../canvas-types';
import type { ScreenshotZoomLayer } from '@beam/engine/screenshot/screenshot-types';
import { manualCameraZoom } from '@beam/engine/zoom/manual-zoom';
import { renderGlassHighlights } from '../rendering/glass-highlight-render';
import { renderPerspectiveLayers } from '../rendering/perspective-render';
import { createGlassCanvas } from '../zoom/glass-highlight-gpu';
import { hasPerspectiveTilt } from '@beam/engine/zoom/perspective-projection';
import type { OutputCanvasSettings } from '@beam/engine/layout/output-canvas';

const surfaces = new WeakMap<Canvas2DContext, ReturnType<typeof createGlassCanvas>>();

/** Zoom layers affect the composition beneath them, using the video's lens and projection backends. */
export function drawScreenshotZoom(
  target: Canvas2DContext,
  zoom: ScreenshotZoomLayer,
  canvas: OutputCanvasSettings,
  width: number,
  height: number,
  backdrop: CanvasImageSource,
) {
  if (zoom.effect === 'glass') {
    renderGlassHighlights(
      target,
      { canvas: { ...canvas, width, height }, zooms: [{ ...zoom, glass: { ...zoom.glass!, transitionMs: 0 } }] },
      0.5,
      backdrop,
    );
    return;
  }
  let source = surfaces.get(target);
  if (!source) {
    source = createGlassCanvas(width, height);
    surfaces.set(target, source);
  }
  if (source.width !== width) source.width = width;
  if (source.height !== height) source.height = height;
  const capture = source.getContext('2d') as Canvas2DContext | null;
  if (!capture) throw new Error('Screenshot zoom source surface unavailable.');
  capture.clearRect(0, 0, width, height);
  capture.drawImage(backdrop, 0, 0, width, height);
  const camera = manualCameraZoom(zoom);
  const draw = (ctx: Canvas2DContext) => {
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.focus.cx * width, -camera.focus.cy * height);
    ctx.drawImage(source!, 0, 0, width, height);
    ctx.restore();
  };
  target.clearRect(0, 0, width, height);
  if (hasPerspectiveTilt(camera))
    renderPerspectiveLayers({ target, width, height, transform: camera, drawLayers: draw });
  else draw(target);
}

export function disposeScreenshotZoom(target: Canvas2DContext) {
  const surface = surfaces.get(target);
  if (surface) surface.width = surface.height = 0;
  surfaces.delete(target);
}
