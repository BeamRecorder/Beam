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
  const strokeWidth = Math.max(0, style.boxPadding ?? 6) * scale;
  const extrusion = Math.max(0, style.boxRadius ?? 4) * scale;
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
    const outline = style.boxColor ?? '#000000';
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
