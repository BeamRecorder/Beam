import type { CaptionShapeStyle } from '~/media/shared/caption-shape-types';
import type { Canvas2DContext } from '~/types/canvas';

export interface CaptionShapeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function captionShapeRadius(shape: CaptionShapeStyle, rect: CaptionShapeRect): number {
  const maxRadius = Math.min(rect.width, rect.height) / 2;
  if (shape.preset === 'square') return 0;
  if (shape.preset === 'pill') return maxRadius;
  const radius = shape.preset === 'rounded' ? 35 : shape.radius;
  return maxRadius * (clamp(radius, 0, 100) / 100);
}

const createScratchCanvas = (width: number, height: number): OffscreenCanvas | HTMLCanvasElement | null => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const shapePath = (ctx: Canvas2DContext, rect: CaptionShapeRect, radius: number) => {
  ctx.beginPath();
  if (radius > 0) ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  else ctx.rect(rect.x, rect.y, rect.width, rect.height);
};

function drawShapeBlur(ctx: Canvas2DContext, rect: CaptionShapeRect, radius: number, blur: number) {
  if (blur <= 0) return;
  const canvas = ctx.canvas;
  const transform =
    typeof ctx.getTransform === 'function' ? ctx.getTransform() : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const scaleX = Math.hypot(transform.a, transform.b);
  const scaleY = Math.hypot(transform.c, transform.d);
  const x = Math.max(0, Math.floor(rect.x * scaleX + transform.e));
  const y = Math.max(0, Math.floor(rect.y * scaleY + transform.f));
  const right = Math.min(canvas.width, Math.ceil((rect.x + rect.width) * scaleX + transform.e));
  const bottom = Math.min(canvas.height, Math.ceil((rect.y + rect.height) * scaleY + transform.f));
  const width = right - x;
  const height = bottom - y;
  if (width <= 0 || height <= 0) return;
  const scratch = createScratchCanvas(width, height);
  const scratchContext = scratch?.getContext('2d');
  if (!scratch || !scratchContext) throw new Error('Caption shape blur requires a 2D scratch canvas.');
  scratchContext.drawImage(canvas, x, y, width, height, 0, 0, width, height);
  ctx.save();
  shapePath(ctx, rect, radius);
  ctx.clip();
  ctx.filter = `blur(${blur}px)`;
  const overscan = blur * 2;
  ctx.drawImage(scratch, rect.x - overscan, rect.y - overscan, rect.width + overscan * 2, rect.height + overscan * 2);
  ctx.restore();
}

export function drawCaptionShape(
  ctx: Canvas2DContext,
  rect: CaptionShapeRect,
  shape: CaptionShapeStyle,
  scale: number,
) {
  if (rect.width <= 0 || rect.height <= 0) return;
  const blur = clamp(shape.blur, 0, 48) * scale;
  const opacity = clamp(shape.opacity, 0, 100) / 100;
  if (blur <= 0 && opacity <= 0) return;
  const radius = captionShapeRadius(shape, rect);
  ctx.save();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  drawShapeBlur(ctx, rect, radius, blur);
  if (opacity > 0) {
    shapePath(ctx, rect, radius);
    ctx.globalAlpha = opacity;
    ctx.fillStyle = shape.color;
    ctx.fill();
  }
  ctx.restore();
}
