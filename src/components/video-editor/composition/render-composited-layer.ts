import type { Canvas2DContext } from '~/types/canvas';
import type { LayerCompositing } from '~/media/shared/layer-compositing-types';

const surfaces = new WeakMap<Canvas2DContext, OffscreenCanvas>();

/** Flatten the layer before blending, so overlaps, text and shadows share one opacity. */
export function renderCompositedLayer(
  ctx: Canvas2DContext,
  layer: LayerCompositing,
  width: number,
  height: number,
  draw: (target: Canvas2DContext, backdrop: CanvasImageSource) => void,
) {
  if (layer.opacity <= 0) return;
  if (layer.opacity === 100 && layer.blendMode === 'source-over') {
    ctx.save();
    try {
      draw(ctx, ctx.canvas);
    } finally {
      ctx.restore();
    }
    return;
  }
  let surface = surfaces.get(ctx);
  if (!surface) {
    surface = new OffscreenCanvas(width, height);
    surfaces.set(ctx, surface);
  }
  if (surface.width !== width) surface.width = width;
  if (surface.height !== height) surface.height = height;
  const target = surface.getContext('2d');
  if (!target) throw new Error('Layer rendering context unavailable.');
  target.clearRect(0, 0, width, height);
  target.save();
  try {
    draw(target, ctx.canvas);
  } finally {
    target.restore();
  }
  ctx.save();
  try {
    ctx.globalAlpha *= layer.opacity / 100;
    ctx.globalCompositeOperation = layer.blendMode;
    ctx.drawImage(surface, 0, 0);
  } finally {
    ctx.restore();
  }
}
