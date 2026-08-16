import type { BlurClip } from '~/media/shared/composition-types';
import type { Canvas2DContext } from '~/types/canvas';

export interface EffectRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type ScratchCanvas = HTMLCanvasElement | OffscreenCanvas;
interface ScratchSurface {
  canvas: ScratchCanvas;
  context: Canvas2DContext;
}
interface ScratchPool {
  source: ScratchSurface;
  effect: ScratchSurface;
  mask: ScratchSurface;
  pixel: ScratchSurface;
}

const scratchPools = new WeakMap<Canvas2DContext, ScratchPool>();

const createCanvas = (width: number, height: number): ScratchCanvas => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error('Canvas scratch surface is unavailable.');
};

const createSurface = (width: number, height: number): ScratchSurface => {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d') as Canvas2DContext | null;
  if (!context) throw new Error('Canvas scratch context is unavailable.');
  return { canvas, context };
};

const growSurface = (surface: ScratchSurface, width: number, height: number) => {
  if (surface.canvas.width >= width && surface.canvas.height >= height) return;
  const nextSize = (value: number) => 2 ** Math.ceil(Math.log2(Math.max(1, value)));
  surface.canvas.width = Math.max(surface.canvas.width, nextSize(width));
  surface.canvas.height = Math.max(surface.canvas.height, nextSize(height));
};

const scratchPoolFor = (ctx: Canvas2DContext): ScratchPool => {
  let pool = scratchPools.get(ctx);
  if (!pool) {
    pool = {
      source: createSurface(1, 1),
      effect: createSurface(1, 1),
      mask: createSurface(1, 1),
      pixel: createSurface(1, 1),
    };
    scratchPools.set(ctx, pool);
  }
  return pool;
};

export const effectShapeRect = (shape: BlurClip['shape'], rect: EffectRect): EffectRect => {
  if (shape === 'rectangle') return rect;
  const size = Math.min(rect.width, rect.height);
  return {
    x: rect.x + (rect.width - size) / 2,
    y: rect.y + (rect.height - size) / 2,
    width: size,
    height: size,
  };
};

const shapePath = (ctx: Canvas2DContext, shape: BlurClip['shape'], rect: EffectRect) => {
  const target = effectShapeRect(shape, rect);
  ctx.beginPath();
  if (shape === 'circle')
    ctx.arc(target.x + target.width / 2, target.y + target.height / 2, target.width / 2, 0, Math.PI * 2);
  else ctx.rect(target.x, target.y, target.width, target.height);
};

const deviceRect = (ctx: Canvas2DContext, rect: EffectRect): EffectRect => {
  const transform = ctx.getTransform();
  const points = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x, rect.y + rect.height],
    [rect.x + rect.width, rect.y + rect.height],
  ].map(([x, y]) => ({
    x: transform.a * x + transform.c * y + transform.e,
    y: transform.b * x + transform.d * y + transform.f,
  }));
  const left = Math.round(Math.min(...points.map((point) => point.x)));
  const top = Math.round(Math.min(...points.map((point) => point.y)));
  const right = Math.round(Math.max(...points.map((point) => point.x)));
  const bottom = Math.round(Math.max(...points.map((point) => point.y)));
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
};

const prepareSurface = (surface: ScratchSurface) => {
  surface.context.setTransform(1, 0, 0, 1, 0, 0);
  surface.context.globalCompositeOperation = 'source-over';
  surface.context.filter = 'none';
  surface.context.clearRect(0, 0, surface.canvas.width, surface.canvas.height);
};

const drawPixelated = (pool: ScratchPool, rect: EffectRect, strength: number) => {
  const blockSize = Math.max(2, Math.round(2 + (strength / 100) * 48));
  const smallWidth = Math.max(1, Math.ceil(rect.width / blockSize));
  const smallHeight = Math.max(1, Math.ceil(rect.height / blockSize));
  growSurface(pool.pixel, smallWidth, smallHeight);
  prepareSurface(pool.pixel);
  pool.pixel.context.imageSmoothingEnabled = false;
  pool.pixel.context.drawImage(
    pool.source.canvas,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    smallWidth,
    smallHeight,
  );
  pool.effect.context.imageSmoothingEnabled = false;
  pool.effect.context.drawImage(
    pool.pixel.canvas,
    0,
    0,
    smallWidth,
    smallHeight,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
  );
  pool.effect.context.imageSmoothingEnabled = true;
};

const drawFiltered = (pool: ScratchPool, clip: BlurClip, width: number, height: number) => {
  const radius = Math.max(0, (clip.strength / 100) * 48);
  pool.effect.context.filter =
    `${radius > 0 ? `blur(${radius}px)` : ''}${clip.mode === 'frosted' ? ' saturate(1.28)' : ''}`.trim() || 'none';
  pool.effect.context.drawImage(pool.source.canvas, 0, 0, width, height, 0, 0, width, height);
  pool.effect.context.filter = 'none';
};

const applyTint = (pool: ScratchPool, clip: BlurClip, rect: EffectRect) => {
  const opacity = clip.mode === 'frosted' ? Math.max(18, clip.tintOpacity) : clip.tintOpacity;
  if (opacity <= 0 || clip.mode === 'opaque') return;
  pool.effect.context.save();
  pool.effect.context.globalAlpha = opacity / 100;
  pool.effect.context.fillStyle = clip.color;
  pool.effect.context.fillRect(rect.x, rect.y, rect.width, rect.height);
  pool.effect.context.restore();
};

const applyShapeMask = (pool: ScratchPool, clip: BlurClip, rect: EffectRect) => {
  prepareSurface(pool.mask);
  const featherPixels = Math.min(48, (Math.min(rect.width, rect.height) * clip.feather) / 500);
  pool.mask.context.filter = featherPixels > 0 ? `blur(${featherPixels}px)` : 'none';
  pool.mask.context.fillStyle = '#ffffff';
  shapePath(pool.mask.context, clip.shape, rect);
  pool.mask.context.fill();
  pool.mask.context.filter = 'none';
  pool.effect.context.globalCompositeOperation = 'destination-in';
  pool.effect.context.drawImage(pool.mask.canvas, 0, 0);
  pool.effect.context.globalCompositeOperation = 'source-over';
};

export function applyBlurEffect(ctx: Canvas2DContext, clip: BlurClip, rect: EffectRect): void {
  if (!ctx.canvas.width || !ctx.canvas.height || rect.width <= 0 || rect.height <= 0) return;
  if (clip.mode === 'blur' && clip.strength <= 0 && clip.tintOpacity <= 0) return;
  const target = deviceRect(ctx, effectShapeRect(clip.shape, rect));
  const radius = clip.mode === 'blur' || clip.mode === 'frosted' ? (clip.strength / 100) * 48 : 0;
  const feather = Math.min(48, (Math.min(target.width, target.height) * clip.feather) / 500);
  const expansion = Math.ceil(radius * 2 + feather + 2);
  const left = Math.max(0, Math.floor(target.x - expansion));
  const top = Math.max(0, Math.floor(target.y - expansion));
  const right = Math.min(ctx.canvas.width, Math.ceil(target.x + target.width + expansion));
  const bottom = Math.min(ctx.canvas.height, Math.ceil(target.y + target.height + expansion));
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return;

  const pool = scratchPoolFor(ctx);
  growSurface(pool.source, width, height);
  growSurface(pool.effect, width, height);
  growSurface(pool.mask, width, height);
  prepareSurface(pool.source);
  pool.source.context.drawImage(ctx.canvas, left, top, width, height, 0, 0, width, height);
  prepareSurface(pool.effect);

  const localTarget = { ...target, x: target.x - left, y: target.y - top };
  if (clip.mode === 'opaque') {
    pool.effect.context.fillStyle = clip.color;
    pool.effect.context.fillRect(localTarget.x, localTarget.y, localTarget.width, localTarget.height);
  } else if (clip.mode === 'pixelated') drawPixelated(pool, localTarget, clip.strength);
  else drawFiltered(pool, clip, width, height);
  applyTint(pool, clip, localTarget);
  applyShapeMask(pool, clip, localTarget);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(pool.effect.canvas, 0, 0, width, height, left, top, width, height);
  ctx.restore();
}
