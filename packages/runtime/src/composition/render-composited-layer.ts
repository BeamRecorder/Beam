import { disposeAnimatedFrameRenderer } from './appearance/animated-frame';
import { releaseLayerPerspective } from './render-layer-perspective';
import { releaseLayerEffects } from '../gradient/layer-effects';
import { disposeBlurEffect } from '@beam/runtime/composition/effects/blur-effect';
import { disposeGlassHighlights } from '../rendering/glass-highlight-render';
import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import type { LayerCompositing } from '@beam/engine/shared/layer-compositing-types';
import { releaseTransitionLayer } from './transitions/transition-layer';
import { disposeTransitionEffects } from './transitions/transition-effects';

const surfaces = new WeakMap<Canvas2DContext, OffscreenCanvas>();

/** Release the scratch surface when its owning renderer has finished. */
export function releaseCompositedLayerSurface(ctx: Canvas2DContext) {
  releaseTransitionLayer(ctx);
  disposeTransitionEffects();
  disposeGlassHighlights(ctx);
  disposeAnimatedFrameRenderer();
  disposeBlurEffect(ctx);
  releaseLayerEffects(ctx);
  releaseLayerPerspective(ctx);
  const surface = surfaces.get(ctx);
  if (!surface) return;
  const target = surface.getContext('2d');
  if (target) {
    disposeGlassHighlights(target);
    disposeBlurEffect(target);
    releaseLayerEffects(target);
    releaseLayerPerspective(target);
  }
  surfaces.delete(ctx);
  surface.width = 0;
  surface.height = 0;
}

/** Flatten the layer before blending, so overlaps, text and shadows share one opacity. */
export function renderCompositedLayer(
  ctx: Canvas2DContext,
  layer: LayerCompositing,
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
  const { width, height } = ctx.canvas;
  let surface = surfaces.get(ctx);
  if (!surface) {
    surface = new OffscreenCanvas(width, height);
    surfaces.set(ctx, surface);
  }
  if (surface.width !== width) surface.width = width;
  if (surface.height !== height) surface.height = height;
  const target = surface.getContext('2d');
  if (!target) throw new Error('Layer rendering context unavailable.');
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.clearRect(0, 0, width, height);
  target.save();
  try {
    target.setTransform(ctx.getTransform());
    draw(target, ctx.canvas);
  } finally {
    target.restore();
  }
  ctx.save();
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha *= layer.opacity / 100;
    ctx.globalCompositeOperation = layer.blendMode;
    ctx.drawImage(surface, 0, 0);
  } finally {
    ctx.restore();
  }
}
