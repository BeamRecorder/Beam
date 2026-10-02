import type { BlurClip } from '~/media/shared/composition-types';
import type { Canvas2DContext } from '~/types/canvas';
import type { BlurEffectOptions, EffectRect, GpuEffectPlan } from './effect-types';
import { effectShapeRect } from './effect-shape';

export function effectDeviceRect(ctx: Canvas2DContext, rect: EffectRect): EffectRect {
  const m = ctx.getTransform();
  const points = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x, rect.y + rect.height],
    [rect.x + rect.width, rect.y + rect.height],
  ].map(([x, y]) => ({ x: m.a * x! + m.c * y! + m.e, y: m.b * x! + m.d * y! + m.f }));
  const x = Math.round(Math.min(...points.map((p) => p.x))),
    y = Math.round(Math.min(...points.map((p) => p.y)));
  return {
    x,
    y,
    width: Math.max(1, Math.round(Math.max(...points.map((p) => p.x))) - x),
    height: Math.max(1, Math.round(Math.max(...points.map((p) => p.y))) - y),
  };
}

export function planGpuEffect(
  ctx: Canvas2DContext,
  clip: BlurClip,
  rect: EffectRect,
  options: BlurEffectOptions,
): GpuEffectPlan | null {
  const m = ctx.getTransform(),
    bounds = options.bounds ?? rect;
  if (
    ![
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      m.a,
      m.b,
      m.c,
      m.d,
      m.e,
      m.f,
      clip.strength,
      clip.feather,
      clip.tintOpacity,
    ].every(Number.isFinite) ||
    [clip.strength, clip.feather, clip.tintOpacity].some((v) => v < 0 || v > 100)
  )
    throw new RangeError('Invalid GPU effect geometry or strength.');
  if (
    !ctx.canvas.width ||
    !ctx.canvas.height ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    (clip.mode === 'blur' && clip.strength <= 0) ||
    (clip.mode === 'highlight' && clip.strength <= 0 && clip.tintOpacity <= 0)
  )
    return null;
  const target = effectDeviceRect(ctx, effectShapeRect(clip.shape, options.bounds ?? rect));
  const maskTarget = options.maskPath ? effectDeviceRect(ctx, rect) : target;
  const sigma = clip.mode === 'blur' || clip.mode === 'frosted' ? clip.strength * 0.48 : 0;
  let feather = Math.min(48, (Math.min(maskTarget.width, maskTarget.height) * clip.feather) / 500);
  if (clip.mode === 'highlight') {
    const matrix = ctx.getTransform(),
      scale = Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
    feather = Math.min(
      48,
      (Math.min(ctx.canvas.width, ctx.canvas.height) * 48) / 1080,
      (Math.min(rect.width, rect.height) * scale * clip.feather) / 500,
    );
    return {
      region: { x: 0, y: 0, width: ctx.canvas.width, height: ctx.canvas.height },
      target,
      maskTarget: rect,
      sigma: 0,
      feather,
      matrix,
    };
  }
  const expansion = Math.ceil(sigma * 3 + feather * 3 + 2);
  const x = Math.max(0, Math.floor(target.x - expansion)),
    y = Math.max(0, Math.floor(target.y - expansion));
  const right = Math.min(ctx.canvas.width, Math.ceil(target.x + target.width + expansion)),
    bottom = Math.min(ctx.canvas.height, Math.ceil(target.y + target.height + expansion));
  if (right <= x || bottom <= y) return null;
  return {
    region: { x, y, width: right - x, height: bottom - y },
    target: { ...target, x: target.x - x, y: target.y - y },
    maskTarget: { ...maskTarget, x: maskTarget.x - x, y: maskTarget.y - y },
    sigma,
    feather,
  };
}
