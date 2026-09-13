import type { BlurClip } from '~/media/shared/composition-types';
import type { Canvas2DContext } from '~/types/canvas';
import type { EffectRect, ScratchSurface } from './effect-types';
import { appendEffectShape } from './effect-shape';

const surfaces = new WeakMap<Canvas2DContext, ScratchSurface>();

export function releaseHighlightSurface(ctx: Canvas2DContext) {
  const surface = surfaces.get(ctx);
  if (!surface) return;
  surface.canvas.width = surface.canvas.height = 0;
  surfaces.delete(ctx);
}

function surfaceFor(ctx: Canvas2DContext): ScratchSurface {
  let surface = surfaces.get(ctx);
  if (!surface) {
    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(ctx.canvas.width, ctx.canvas.height)
        : document.createElement('canvas');
    const context = canvas.getContext('2d') as Canvas2DContext | null;
    if (!context) throw new Error('Highlight canvas context is unavailable.');
    surface = { canvas, context };
    surfaces.set(ctx, surface);
  }
  if (surface.canvas.width !== ctx.canvas.width) surface.canvas.width = ctx.canvas.width;
  if (surface.canvas.height !== ctx.canvas.height) surface.canvas.height = ctx.canvas.height;
  return surface;
}

/** Independent interior and surround tints sharing the same shape and feathered edge. */
export function applyHighlightEffect(ctx: Canvas2DContext, clip: BlurClip, rect: EffectRect) {
  const { width, height } = ctx.canvas;
  if (!width || !height || rect.width <= 0 || rect.height <= 0 || (clip.strength <= 0 && clip.tintOpacity <= 0)) return;
  const matrix = ctx.getTransform();
  const opacity = ctx.globalAlpha;
  const highlightColor = clip.highlightColor ?? '#ffffff';
  ctx.save();
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (clip.feather <= 0) {
      releaseHighlightSurface(ctx);
      if (clip.strength > 0) {
        ctx.globalAlpha = (opacity * clip.strength) / 100;
        ctx.beginPath();
        ctx.rect(0, 0, width, height);
        ctx.setTransform(matrix);
        appendEffectShape(ctx, clip, rect);
        ctx.fillStyle = clip.color;
        ctx.fill('evenodd');
      }
      if (clip.tintOpacity > 0) {
        ctx.globalAlpha = (opacity * clip.tintOpacity) / 100;
        ctx.setTransform(matrix);
        ctx.beginPath();
        appendEffectShape(ctx, clip, rect);
        ctx.fillStyle = highlightColor;
        ctx.fill();
      }
      return;
    }
    const { canvas, context } = surfaceFor(ctx);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = 'source-over';
    context.filter = 'none';
    context.clearRect(0, 0, width, height);
    const scale = Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
    const feather = Math.min(
      (Math.min(width, height) * 48) / 1080,
      (Math.min(rect.width, rect.height) * scale * clip.feather) / 500,
    );
    if (clip.strength > 0) {
      context.globalAlpha = clip.strength / 100;
      context.fillStyle = clip.color;
      context.fillRect(0, 0, width, height);
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'destination-out';
      context.filter = `blur(${feather}px)`;
      context.setTransform(matrix);
      context.beginPath();
      appendEffectShape(context, clip, rect);
      context.fillStyle = '#ffffff';
      context.fill();
    }
    context.globalCompositeOperation = 'source-over';
    if (clip.tintOpacity > 0) {
      context.globalAlpha = clip.tintOpacity / 100;
      context.filter = `blur(${feather}px)`;
      context.setTransform(matrix);
      context.beginPath();
      appendEffectShape(context, clip, rect);
      context.fillStyle = highlightColor;
      context.fill();
    }
    context.globalAlpha = 1;
    context.filter = 'none';
    // Keep the caller's transition opacity/filter and composition blend mode.
    ctx.drawImage(canvas, 0, 0);
  } finally {
    ctx.restore();
  }
}
