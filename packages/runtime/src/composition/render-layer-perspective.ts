import { releaseLayerEffects } from '../gradient/layer-effects';
import { disposeBlurEffect } from './effects/blur-effect';
import type { Canvas2DContext } from '../canvas-types';
import type { LayerRotation3d, LayerPerspectiveRect } from '@beam/engine/layout/layer-perspective-types';
import { layerPerspectiveGeometry, hasLayerRotation3d } from '@beam/engine/layout/layer-perspective';
import { WebGlPerspectiveProjector } from '../zoom/webgl-perspective-projector';
import type { LayerPerspectiveSurface } from './layer-perspective-runtime-types';
const surfaces = new WeakMap<Canvas2DContext, LayerPerspectiveSurface>();
export function releaseLayerPerspective(ctx: Canvas2DContext) {
  const surface = surfaces.get(ctx);
  if (!surface) return;
  surface.projector.dispose();
  releaseLayerEffects(surface.context);
  disposeBlurEffect(surface.context);
  surface.canvas.width = surface.canvas.height = 0;
  surfaces.delete(ctx);
}
/** One retained GPU projector per owning canvas, reused between layers and frames. */
export function drawWithLayerPerspective(
  ctx: Canvas2DContext,
  rotation: LayerRotation3d | undefined,
  rect: LayerPerspectiveRect,
  pixelScale: number,
  draw: (target: Canvas2DContext) => void,
) {
  if (!hasLayerRotation3d(rotation)) return draw(ctx);
  const { width, height } = ctx.canvas;
  let surface = surfaces.get(ctx);
  if (!surface) {
    const canvas = new OffscreenCanvas(width, height),
      context = canvas.getContext('2d');
    if (!context) throw new Error('Layer perspective canvas unavailable.');
    surface = { canvas, context, projector: new WebGlPerspectiveProjector() };
    surfaces.set(ctx, surface);
  }
  if (surface.canvas.width !== width) surface.canvas.width = width;
  if (surface.canvas.height !== height) surface.canvas.height = height;
  const matrix = ctx.getTransform();
  const origin = {
    x: matrix.a * rect.x + matrix.e,
    y: matrix.d * rect.y + matrix.f,
    width: matrix.a * rect.width,
    height: matrix.d * rect.height,
  };
  surface.context.clearRect(0, 0, width, height);
  surface.context.save();
  try {
    surface.context.setTransform(matrix);
    draw(surface.context);
  } finally {
    surface.context.restore();
  }
  const positions = layerPerspectiveGeometry(width, height, origin, {
    ...rotation!,
    perspective: rotation!.perspective * pixelScale * matrix.a,
  });
  const projected = surface.projector.renderGeometry(surface.canvas, width, height, positions);
  ctx.save();
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(projected, 0, 0);
  } finally {
    ctx.restore();
  }
}
