import type { BlurClip } from '~/media/shared/composition-types';
import type { Canvas2DContext } from '~/types/canvas';
import type { GpuColor } from '~/media/gpu/gpu-scene-types';
import { GpuEffectsRenderer } from '~/media/gpu/gpu-effects-renderer';
import type { EffectRect, BlurEffectOptions, ScratchSurface, GpuEffectPlan, GpuEffectOwner } from './effect-types';
import { appendEffectShape } from './effect-shape';
import { planGpuEffect } from './gpu-effect-plan';
import { BlurMaskCache } from './blur-mask-cache';

const owners = new WeakMap<Canvas2DContext, GpuEffectOwner>();

const surface = (width: number, height: number): ScratchSurface => {
  const canvas = new OffscreenCanvas(width, height),
    context = canvas.getContext('2d');
  if (!context) {
    canvas.width = canvas.height = 0;
    throw new Error('GPU effect geometry context unavailable.');
  }
  return { canvas, context };
};
const prepare = (value: ScratchSurface, width: number, height: number) => {
  if (value.canvas.width !== width) value.canvas.width = width;
  if (value.canvas.height !== height) value.canvas.height = height;
  value.context.setTransform(1, 0, 0, 1, 0, 0);
  value.context.globalAlpha = 1;
  value.context.globalCompositeOperation = 'source-over';
  value.context.filter = 'none';
  value.context.clearRect(0, 0, width, height);
};
const color = (value: string): GpuColor => {
  if (!/^#[\da-f]{6}([\da-f]{2})?$/i.test(value)) throw new RangeError('Invalid GPU effect color.');
  return [
    parseInt(value.slice(1, 3), 16) / 255,
    parseInt(value.slice(3, 5), 16) / 255,
    parseInt(value.slice(5, 7), 16) / 255,
    value.length === 9 ? parseInt(value.slice(7, 9), 16) / 255 : 1,
  ];
};

function ownerFor(ctx: Canvas2DContext) {
  let owner = owners.get(ctx);
  if (!owner) {
    const gpu = new GpuEffectsRenderer();
    let source: ScratchSurface | undefined;
    try {
      source = surface(1, 1);
      owner = { gpu, source, mask: surface(1, 1), cache: new BlurMaskCache(), groupRegion: null };
      owners.set(ctx, owner);
    } catch (error) {
      gpu.dispose();
      if (source) source.canvas.width = source.canvas.height = 0;
      throw error;
    }
  }
  return owner;
}

/** Cache only immutable geometry; every effect samples the current video's completed backdrop. */
function maskFor(
  owner: ReturnType<typeof ownerFor>,
  clip: BlurClip,
  plan: GpuEffectPlan,
  options: BlurEffectOptions,
  outside = false,
): { surface: ScratchSurface; immutable: boolean } {
  const padding = plan.feather > 0.03 ? Math.ceil(plan.feather * 3) + 2 : 0;
  const width = plan.region.width + padding * 2,
    height = plan.region.height + padding * 2,
    r = plan.maskTarget;
  const key =
    !options.maskPath || options.maskCacheKey
      ? JSON.stringify([
          outside,
          width,
          height,
          r,
          clip.shape,
          clip.cornerRadius ?? 0,
          plan.matrix && [plan.matrix.a, plan.matrix.b, plan.matrix.c, plan.matrix.d, plan.matrix.e, plan.matrix.f],
          options.maskCacheKey ?? null,
        ])
      : null;
  const cached = key ? owner.cache.get(key) : null;
  if (cached) return { surface: cached, immutable: true };
  const retain = key && owner.cache.canRetain(width, height),
    mask = retain ? surface(width, height) : owner.mask;
  try {
    prepare(mask, width, height);
    mask.context.fillStyle = '#ffffff';
    mask.context.beginPath();
    if (outside) {
      if (options.maskPath) {
        mask.context.fillRect(0, 0, width, height);
        mask.context.globalCompositeOperation = 'destination-out';
      } else mask.context.rect(0, 0, width, height);
    }
    if (plan.matrix) {
      const m = plan.matrix;
      mask.context.setTransform(m.a, m.b, m.c, m.d, m.e + padding, m.f + padding);
    } else mask.context.setTransform(1, 0, 0, 1, padding, padding);
    if (options.maskPath) options.maskPath(mask.context, r);
    else appendEffectShape(mask.context, clip, r);
    if (outside && !options.maskPath) mask.context.fill('evenodd');
    else mask.context.fill();
    if (key && retain) owner.cache.set(key, mask);
    return { surface: mask, immutable: !!retain };
  } catch (error) {
    if (retain) mask.canvas.width = mask.canvas.height = 0;
    throw error;
  }
}

export function applyBlurEffect(
  ctx: Canvas2DContext,
  clip: BlurClip,
  rect: EffectRect,
  options: BlurEffectOptions = {},
): void {
  const plan = planGpuEffect(ctx, clip, rect, options);
  if (!plan) return;
  const rgba = color(clip.color),
    highlight = color(clip.highlightColor ?? '#ffffff');
  const owner = ownerFor(ctx),
    { width, height, x, y } = plan.region;
  const mask = maskFor(owner, clip, plan, options);
  const input = {
    mask: mask.surface.canvas as OffscreenCanvas,
    maskImmutable: mask.immutable,
    maskPadding: plan.feather > 0.03 ? Math.ceil(plan.feather * 3) + 2 : 0,
    width,
    height,
    target: plan.target,
    sigma: plan.sigma,
    feather: plan.feather,
    mode: clip.mode,
    color: rgba,
    highlight,
    strength: clip.strength,
    tintOpacity: clip.tintOpacity,
  };
  if (owner.groupRegion) {
    if (options.source) throw new Error('GPU blur groups require their live retained backdrop.');
    owner.gpu.apply(input, { ...plan.region, x: x - owner.groupRegion.x, y: y - owner.groupRegion.y });
    return;
  }
  if (clip.mode !== 'opaque' && clip.mode !== 'highlight') {
    prepare(owner.source, width, height);
    // Crop before upload: small effects must not transfer a full 1080p backdrop each time.
    owner.source.context.drawImage(options.source ?? ctx.canvas, x, y, width, height, 0, 0, width, height);
  }
  ctx.save();
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const paint = (highlightStage?: 'outside' | 'inside') => {
      const geometry = highlightStage ? maskFor(owner, clip, plan, options, highlightStage === 'outside') : mask;
      const result = owner.gpu.render({
        ...input,
        mask: geometry.surface.canvas as OffscreenCanvas,
        maskImmutable: geometry.immutable,
        highlightStage,
        source: owner.source.canvas as OffscreenCanvas,
      });
      ctx.drawImage(result, 0, 0, width, height, x, y, width, height);
    };
    // Hard highlights inherit alpha/blend on each layer, not on a pre-flattened pair.
    if (clip.mode === 'highlight' && plan.feather <= 0.03) {
      if (clip.strength > 0) paint('outside');
      if (clip.tintOpacity > 0) paint('inside');
    } else paint();
  } finally {
    ctx.restore();
  }
}

/** Caller admits only full-opacity, source-over effects whose complete footprint is inside its clip. */
export function withGpuBlurGroup(ctx: Canvas2DContext, draw: () => void, region?: EffectRect): void {
  const owner = ownerFor(ctx);
  if (owner.groupRegion) throw new Error('Nested GPU blur groups are not supported.');
  const bounds = region ?? { x: 0, y: 0, width: ctx.canvas.width, height: ctx.canvas.height };
  if (
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isSafeInteger) ||
    bounds.x < 0 ||
    bounds.y < 0 ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    bounds.x + bounds.width > ctx.canvas.width ||
    bounds.y + bounds.height > ctx.canvas.height
  )
    throw new RangeError('Invalid GPU group bounds.');
  if (region) {
    prepare(owner.source, bounds.width, bounds.height);
    owner.source.context.drawImage(
      ctx.canvas,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0,
      0,
      bounds.width,
      bounds.height,
    );
  }
  owner.gpu.begin((region ? owner.source.canvas : ctx.canvas) as OffscreenCanvas, bounds.width, bounds.height);
  owner.groupRegion = bounds;
  try {
    draw();
    const result = owner.gpu.present();
    ctx.save();
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // COPY clears outside its source; constrain it to the transferred backdrop region.
      if (region) {
        ctx.beginPath();
        ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
        ctx.clip();
      }
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(result, 0, 0, bounds.width, bounds.height, bounds.x, bounds.y, bounds.width, bounds.height);
    } finally {
      ctx.restore();
    }
  } finally {
    owner.groupRegion = null;
    owner.gpu.cancel();
  }
}

export function disposeBlurEffect(ctx: Canvas2DContext | null): void {
  if (!ctx) return;
  const owner = owners.get(ctx);
  owners.delete(ctx);
  if (!owner) return;
  owner.gpu.dispose();
  owner.cache.clear();
  owner.source.canvas.width = owner.source.canvas.height = owner.mask.canvas.width = owner.mask.canvas.height = 0;
}
