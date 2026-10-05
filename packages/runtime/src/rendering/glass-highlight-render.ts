import type { Canvas2DContext } from '../canvas-types';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import type { GlassRenderResources, GlassScenePainter } from '../zoom/glass-highlight-gpu-types';
import { glassHighlightsAt } from '@beam/engine/zoom/glass-highlight';
import { createGlassCanvas, GlassHighlightGpu } from '../zoom/glass-highlight-gpu';
import { glassRasterSize } from '../zoom/glass-raster';

const resources = new Map<Canvas2DContext, GlassRenderResources>();

/** Render original sources at lens density, rather than enlarging the already reduced preview. */
export function renderGlassHighlights(
  ctx: Canvas2DContext,
  snapshot: Pick<CompositionSnapshot, 'canvas' | 'zooms'>,
  timeMs: number,
  backdrop?: CanvasImageSource,
  drawScene?: GlassScenePainter,
) {
  const { width, height } = snapshot.canvas;
  const highlights = glassHighlightsAt(snapshot.zooms, timeMs, width, height);
  if (!highlights.length) return;
  let scope = resources.get(ctx);
  if (!scope) {
    scope = { gpu: new GlassHighlightGpu(), scene: createGlassCanvas(1, 1) };
    resources.set(ctx, scope);
  }
  const { gpu, scene } = scope;
  const transform = ctx.getTransform();
  const pixelScale = Math.max(Math.hypot(transform.a, transform.b), Math.hypot(transform.c, transform.d));
  const density = pixelScale * Math.max(...highlights.map((sample) => sample.magnification));
  const raster = glassRasterSize(width, height, density);
  if (scene.width !== raster.width) scene.width = raster.width;
  if (scene.height !== raster.height) scene.height = raster.height;
  const capture = scene.getContext('2d') as Canvas2DContext | null;
  if (!capture) throw new Error('Glass highlight scene surface unavailable.');
  capture.clearRect(0, 0, scene.width, scene.height);
  if (drawScene) {
    scope.disposeScene = drawScene.dispose;
    drawScene.draw(capture, scene.width, scene.height);
  } else {
    const inverse = transform.inverse();
    capture.save();
    capture.scale(scene.width / width, scene.height / height);
    capture.transform(inverse.a, inverse.b, inverse.c, inverse.d, inverse.e, inverse.f);
    capture.drawImage(backdrop ?? ctx.canvas, 0, 0);
    capture.restore();
  }
  gpu.upload(scene, scene.width, scene.height, width, height);
  for (const highlight of highlights) {
    const result = gpu.render(highlight, pixelScale);
    ctx.drawImage(result.canvas, result.x, result.y, result.width, result.height);
  }
}

export function disposeGlassHighlights(ctx?: Canvas2DContext) {
  for (const [owner, scope] of resources) {
    if (ctx && owner !== ctx) continue;
    resources.delete(owner);
    const capture = scope.scene.getContext('2d') as Canvas2DContext | null;
    if (capture) {
      if (scope.disposeScene) scope.disposeScene(capture);
      else disposeGlassHighlights(capture);
    }
    scope.gpu.dispose();
    scope.scene.width = scope.scene.height = 0;
  }
}
