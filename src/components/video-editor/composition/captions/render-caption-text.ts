import type { CaptionClip } from '~/media/shared/composition-types';
import { layoutCaptionText, type CaptionTextMeasurer } from '~/media/shared/caption-text-layout';

export interface CaptionViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

const shadowOffsets = (blur: number, direction: string | undefined) => ({
  x: direction === 'top-left' ? -blur * 0.5 : direction === 'bottom-right' ? blur * 0.5 : 0,
  y: direction === 'top-left' ? -blur * 0.5 : direction === 'bottom' || direction === 'bottom-right' ? blur * 0.5 : 0,
});

const createScratchCanvas = (width: number, height: number): OffscreenCanvas | HTMLCanvasElement | null => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

function drawBackdropBlur(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  blur: number,
) {
  if (blur <= 0 || rect.width <= 0 || rect.height <= 0) return;
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
  if (!scratch || !scratchContext) throw new Error('Caption backdrop blur requires a 2D scratch canvas.');
  scratchContext.drawImage(canvas, x, y, width, height, 0, 0, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  ctx.filter = `blur(${blur}px)`;
  const overscan = blur * 2;
  ctx.drawImage(scratch, rect.x - overscan, rect.y - overscan, rect.width + overscan * 2, rect.height + overscan * 2);
  ctx.restore();
}

export function drawCaptionText(
  ctx: CanvasRenderingContext2D,
  options: {
    clip: CaptionClip;
    text: string;
    canvas: { width: number; height: number };
    viewport: CaptionViewport;
  },
) {
  if (!options.text) return;
  const style = options.clip.caption.style;
  const canonicalFont = `800 ${Math.max(1, style.fontSize)}px sans-serif`;
  ctx.save();
  ctx.font = canonicalFont;
  const measureText: CaptionTextMeasurer = (text) => ctx.measureText(text).width;
  const layout = layoutCaptionText({
    clip: options.clip,
    text: options.text,
    canvasWidth: options.canvas.width,
    canvasHeight: options.canvas.height,
    measureText,
  });
  const scale = options.viewport.width / Math.max(1, options.canvas.width);
  const transform = layout.transform;
  const centerX = options.viewport.x + (transform.x + transform.width / 2) * options.viewport.width;
  const centerY = options.viewport.y + (transform.y + transform.height / 2) * options.viewport.height;
  const fontSize = layout.fontSize * scale;
  const lineHeight = layout.lineHeight * scale;
  const maxTextWidth = layout.maxTextWidth * scale;
  const strokeWidth = Math.max(0, style.outlineWidth) * scale;
  const extrusion = Math.max(0, style.extrusionDepth) * scale;
  const shadowBlur = Math.max(0, style.shadowBlur) * scale;
  const offsets = shadowOffsets(shadowBlur, style.shadowDirection);
  ctx.font = `800 ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (shadowBlur > 0) {
    ctx.shadowColor = style.shadowColor || 'rgba(0,0,0,.85)';
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = style.shadowOffsetX === undefined ? offsets.x : style.shadowOffsetX * scale;
    ctx.shadowOffsetY = style.shadowOffsetY === undefined ? offsets.y : style.shadowOffsetY * scale;
  }

  const firstY = centerY - ((layout.lines.length - 1) * lineHeight) / 2;
  const textWidth = Math.max(
    1,
    ...layout.lines.map((line) =>
      layout.wrap ? ctx.measureText(line).width : Math.min(maxTextWidth, ctx.measureText(line).width),
    ),
  );
  drawBackdropBlur(
    ctx,
    {
      x: centerX - textWidth / 2 - strokeWidth,
      y: firstY - fontSize / 2 - strokeWidth,
      width: textWidth + strokeWidth * 2 + extrusion,
      height: Math.max(fontSize, layout.lines.length * lineHeight) + strokeWidth * 2 + extrusion,
    },
    style.backdropBlur * scale,
  );
  const drawLine = (line: string, y: number) => {
    if (extrusion > 0) {
      ctx.save();
      ctx.strokeStyle = style.shadowColor || 'rgba(0,0,0,.85)';
      ctx.fillStyle = style.shadowColor || 'rgba(0,0,0,.85)';
      ctx.lineWidth = strokeWidth * 2;
      for (let step = Math.ceil(extrusion); step >= 1; step -= 1) {
        const offset = Math.min(step, extrusion);
        if (layout.wrap) {
          ctx.strokeText(line, centerX + offset, y + offset);
          ctx.fillText(line, centerX + offset, y + offset);
        } else {
          ctx.strokeText(line, centerX + offset, y + offset, maxTextWidth);
          ctx.fillText(line, centerX + offset, y + offset, maxTextWidth);
        }
        ctx.shadowColor = 'transparent';
      }
      ctx.restore();
      ctx.shadowColor = 'transparent';
    }
    const outline = style.outlineColor;
    if (outline !== 'transparent' && strokeWidth > 0) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = strokeWidth * 2;
      if (layout.wrap) ctx.strokeText(line, centerX, y);
      else ctx.strokeText(line, centerX, y, maxTextWidth);
      ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = style.color || '#ffffff';
    if (layout.wrap) ctx.fillText(line, centerX, y);
    else ctx.fillText(line, centerX, y, maxTextWidth);
  };
  layout.lines.forEach((line, index) => drawLine(line, firstY + index * lineHeight));
  ctx.restore();
}
