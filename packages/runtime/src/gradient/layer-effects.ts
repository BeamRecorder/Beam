import { disposeBlurEffect } from '../composition/effects/blur-effect';
import type { LayerEffect } from '@beam/engine/gradient/gradient-types';
import type { Canvas2DContext } from '../canvas-types';
import type { GradientRect, LayerEffectRuntime } from './gradient-types';
import { GradientRenderer } from './gradient-renderer';
import { gradientProjection } from './gradient-projection';
import { colorAdjustmentFilter } from './color-filter';

const surfaces = new WeakMap<Canvas2DContext, LayerEffectRuntime>();
function createSurfaces(width: number, height: number): LayerEffectRuntime {
  const layer = new OffscreenCanvas(width, height),
    base = new OffscreenCanvas(width, height),
    result = new OffscreenCanvas(width, height);
  const layerContext = layer.getContext('2d'),
    baseContext = base.getContext('2d'),
    resultContext = result.getContext('2d');
  if (!layerContext || !baseContext || !resultContext) throw new Error('Layer effect rendering is unavailable.');
  return { layer, base, result, layerContext, baseContext, resultContext };
}
export function releaseLayerEffects(ctx: Canvas2DContext) {
  const runtime = surfaces.get(ctx);
  if (!runtime) return;
  runtime.renderer?.dispose();
  disposeBlurEffect(runtime.layerContext);
  for (const canvas of [runtime.layer, runtime.base, runtime.result]) canvas.width = canvas.height = 0;
  surfaces.delete(ctx);
}

/** Fill the isolated layer's alpha, then apply the layer's own opacity/blending at the caller. */
export function drawWithLayerEffects(
  ctx: Canvas2DContext,
  effects: readonly LayerEffect[],
  rect: GradientRect,
  pixelRatio: number,
  draw: (target: Canvas2DContext) => void,
) {
  const active = effects.filter((effect) => effect.enabled && effect.opacity > 0);
  if (!active.length) {
    draw(ctx);
    return;
  }
  let runtime = surfaces.get(ctx);
  if (!runtime) {
    runtime = createSurfaces(ctx.canvas.width, ctx.canvas.height);
    surfaces.set(ctx, runtime);
  }
  const { layer, base, result, layerContext, baseContext, resultContext } = runtime;
  for (const canvas of [layer, base, result]) {
    if (canvas.width !== ctx.canvas.width) canvas.width = ctx.canvas.width;
    if (canvas.height !== ctx.canvas.height) canvas.height = ctx.canvas.height;
  }
  layerContext.clearRect(0, 0, layer.width, layer.height);
  layerContext.save();
  try {
    layerContext.setTransform(ctx.getTransform());
    draw(layerContext);
  } finally {
    layerContext.restore();
  }
  for (const effect of active) {
    baseContext.clearRect(0, 0, base.width, base.height);
    baseContext.drawImage(layer, 0, 0);
    resultContext.clearRect(0, 0, result.width, result.height);
    resultContext.save();
    try {
      if (effect.kind === 'gradient') {
        const renderer = (runtime.renderer ??= new GradientRenderer());
        const gradient = renderer.render(
          effect.recipe,
          layer.width,
          layer.height,
          gradientProjection(rect, ctx.getTransform()),
          rect,
          pixelRatio,
        );
        resultContext.drawImage(base, 0, 0);
        resultContext.globalCompositeOperation = effect.blendMode;
        resultContext.drawImage(gradient, 0, 0);
        resultContext.globalCompositeOperation = 'destination-in';
        resultContext.drawImage(base, 0, 0);
      } else {
        resultContext.filter = colorAdjustmentFilter(effect.recipe);
        resultContext.drawImage(base, 0, 0);
      }
    } finally {
      resultContext.restore();
    }
    // Crossfade two premultiplied surfaces with identical alpha. source-over would thicken antialiased edges.
    layerContext.clearRect(0, 0, layer.width, layer.height);
    layerContext.save();
    try {
      layerContext.globalAlpha = 1 - effect.opacity / 100;
      layerContext.drawImage(base, 0, 0);
      layerContext.globalAlpha = effect.opacity / 100;
      layerContext.globalCompositeOperation = 'lighter';
      layerContext.drawImage(result, 0, 0);
    } finally {
      layerContext.restore();
    }
  }
  ctx.save();
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);
  } finally {
    ctx.restore();
  }
}
