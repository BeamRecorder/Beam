import type { CaptionClip, CaptionStyle } from '~/media/shared/composition-types';
import {
  layoutCaptionText,
  wrapCaptionHighlightLines,
  type CaptionTextMeasurer,
} from '~/media/shared/caption-text-layout';
import type { CaptionWordHighlightContent } from '~/media/shared/caption-highlight-types';
import type { KeyboardCaptionRun } from '~/media/shared/keyboard-captions';
import { keyboardCaptionTransformAtCursor } from '~/media/shared/keyboard-caption-position';
import type { Canvas2DContext } from '~/types/canvas';
import { applyCanvasCaptionFont } from '~/media/shared/caption-font';

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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const highlightMotion = (
  style: CaptionStyle['wordHighlight'],
  progress: number,
  fontSize: number,
): { scale: number; offsetY: number } => {
  const strength = clamp(style.intensity, 0, 100) / 100;
  const phase = clamp(progress, 0, 1);
  if (style.effect === 'pop')
    return {
      scale: 1 + Math.sin(Math.PI * phase) * 0.32 * strength,
      offsetY: 0,
    };
  if (style.effect === 'jump')
    return {
      scale: 1,
      offsetY: -Math.sin(Math.PI * phase) * fontSize * 0.38 * strength,
    };
  if (style.effect === 'pulse')
    return {
      scale: 1 + Math.abs(Math.sin(Math.PI * 2 * phase)) * 0.18 * strength,
      offsetY: 0,
    };
  return { scale: 1, offsetY: 0 };
};

const colorWithAlpha = (color: string, alpha: number): string => {
  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (!hex || alpha >= 1) return color;
  const expanded = hex.length === 3 ? [...hex].map((value) => `${value}${value}`).join('') : hex;
  const value = Number.parseInt(expanded, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${clamp(alpha, 0, 1)})`;
};

const highlightFillStyle = (
  ctx: Canvas2DContext,
  style: CaptionStyle['wordHighlight'],
  rect: { x: number; y: number; width: number; height: number },
): string | CanvasGradient => {
  if (style.fill !== 'gradient') return style.color;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  let gradient: CanvasGradient;
  if (style.gradient.type === 'radial') {
    gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(rect.width, rect.height) / 2);
  } else {
    const angle = (((style.gradient.angle ?? 90) - 90) * Math.PI) / 180;
    const radius = Math.hypot(rect.width, rect.height) / 2;
    const dx = Math.cos(angle) * radius;
    const dy = Math.sin(angle) * radius;
    gradient = ctx.createLinearGradient(centerX - dx, centerY - dy, centerX + dx, centerY + dy);
  }
  for (const stop of [...style.gradient.stops].sort((a, b) => a.position - b.position))
    gradient.addColorStop(clamp(stop.position, 0, 1), colorWithAlpha(stop.color, stop.alpha ?? 1));
  return gradient;
};

const createScratchCanvas = (width: number, height: number): OffscreenCanvas | HTMLCanvasElement | null => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

function drawBackdropBlur(
  ctx: Canvas2DContext,
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
  ctx: Canvas2DContext,
  options: {
    clip: CaptionClip;
    text: string;
    runs?: KeyboardCaptionRun[] | null;
    wordHighlight?: CaptionWordHighlightContent | null;
    cursorPosition?: { x: number; y: number } | null;
    canvas: { width: number; height: number };
    viewport: CaptionViewport;
  },
) {
  if (!options.text) return;
  const style = options.clip.caption.style;
  ctx.save();
  applyCanvasCaptionFont(ctx, style);
  const measureText: CaptionTextMeasurer = (text) => ctx.measureText(text).width;
  const canonicalCursor = options.cursorPosition
    ? {
        x:
          ((options.cursorPosition.x - options.viewport.x) / Math.max(1, options.viewport.width)) *
          options.canvas.width,
        y:
          ((options.cursorPosition.y - options.viewport.y) / Math.max(1, options.viewport.height)) *
          options.canvas.height,
      }
    : null;
  const followTransform =
    canonicalCursor &&
    options.clip.caption.type === 'keyboard' &&
    options.clip.caption.followCursor &&
    options.runs?.length
      ? keyboardCaptionTransformAtCursor({
          cursor: canonicalCursor,
          canvas: options.canvas,
          content: {
            width:
              options.runs.reduce((width, run) => {
                applyCanvasCaptionFont(ctx, style, style.fontSize * run.fontScale);
                return width + ctx.measureText(run.text).width;
              }, 0) +
              style.outlineWidth * 2 +
              style.extrusionDepth,
            height: style.fontSize * (style.lineHeight ?? 1.2) + style.outlineWidth * 2 + style.extrusionDepth,
          },
        })
      : undefined;
  applyCanvasCaptionFont(ctx, style);
  const layout = layoutCaptionText({
    clip: options.clip,
    text: options.text,
    canvasWidth: options.canvas.width,
    canvasHeight: options.canvas.height,
    measureText,
    transform: followTransform,
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
  applyCanvasCaptionFont(ctx, style, fontSize);
  ctx.textAlign = style.textAlign ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (shadowBlur > 0) {
    ctx.shadowColor = style.shadowColor || 'rgba(0,0,0,.85)';
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = style.shadowOffsetX === undefined ? offsets.x : style.shadowOffsetX * scale;
    ctx.shadowOffsetY = style.shadowOffsetY === undefined ? offsets.y : style.shadowOffsetY * scale;
  }

  if (options.wordHighlight?.words.length) {
    const highlight = style.wordHighlight;
    const baseWidth = (text: string) => {
      applyCanvasCaptionFont(ctx, style, fontSize);
      return ctx.measureText(text).width;
    };
    const lines = layout.wrap
      ? wrapCaptionHighlightLines(options.wordHighlight.words, maxTextWidth, baseWidth)
      : [options.wordHighlight.words];
    const spaceWidth = baseWidth(' ');
    const lineWidths = lines.map(
      (line) =>
        line.reduce((width, word) => width + baseWidth(word.text), 0) + Math.max(0, line.length - 1) * spaceWidth,
    );
    const firstY = centerY - ((lines.length - 1) * lineHeight) / 2;
    const widestLine = Math.max(1, ...lineWidths);
    const textX =
      style.textAlign === 'left'
        ? centerX - maxTextWidth / 2
        : style.textAlign === 'right'
          ? centerX + maxTextWidth / 2
          : centerX;
    const backdropX =
      (style.textAlign === 'left' ? textX : style.textAlign === 'right' ? textX - widestLine : textX - widestLine / 2) -
      strokeWidth;
    drawBackdropBlur(
      ctx,
      {
        x: backdropX,
        y: firstY - fontSize / 2 - strokeWidth,
        width: widestLine + strokeWidth * 2 + extrusion,
        height: Math.max(fontSize, lines.length * lineHeight) + strokeWidth * 2 + extrusion,
      },
      style.backdropBlur * scale,
    );
    ctx.textAlign = 'left';
    lines.forEach((line, lineIndex) => {
      const lineWidth = lineWidths[lineIndex] ?? 0;
      let x =
        style.textAlign === 'left' ? textX : style.textAlign === 'right' ? textX - lineWidth : textX - lineWidth / 2;
      const lineY = firstY + lineIndex * lineHeight;
      line.forEach((word, wordIndex) => {
        if (wordIndex > 0) x += spaceWidth;
        const width = baseWidth(word.text);
        const motion = word.active ? highlightMotion(highlight, word.progress, fontSize) : { scale: 1, offsetY: 0 };
        const wordFontSize = fontSize * motion.scale;
        applyCanvasCaptionFont(ctx, style, wordFontSize);
        const renderedWidth = ctx.measureText(word.text).width;
        const drawX = x + (width - renderedWidth) / 2;
        const drawY = lineY + motion.offsetY;
        ctx.save();
        ctx.globalAlpha = word.active ? 1 : clamp(highlight.inactiveOpacity, 0, 100) / 100;
        if (extrusion > 0) {
          ctx.strokeStyle = style.shadowColor || 'rgba(0,0,0,.85)';
          ctx.fillStyle = style.shadowColor || 'rgba(0,0,0,.85)';
          ctx.lineWidth = strokeWidth * 2;
          for (let step = Math.ceil(extrusion); step >= 1; step -= 1) {
            const offset = Math.min(step, extrusion);
            ctx.strokeText(word.text, drawX + offset, drawY + offset);
            ctx.fillText(word.text, drawX + offset, drawY + offset);
            ctx.shadowColor = 'transparent';
          }
        }
        if (style.outlineColor !== 'transparent' && strokeWidth > 0) {
          ctx.strokeStyle = style.outlineColor;
          ctx.lineWidth = strokeWidth * 2;
          ctx.strokeText(word.text, drawX, drawY);
          ctx.shadowColor = 'transparent';
        }
        ctx.fillStyle = word.active
          ? highlightFillStyle(ctx, highlight, {
              x: drawX,
              y: drawY - wordFontSize / 2,
              width: renderedWidth,
              height: wordFontSize,
            })
          : style.color || '#ffffff';
        ctx.fillText(word.text, drawX, drawY);
        if (style.textDecoration === 'line-through')
          ctx.fillRect(drawX, drawY - wordFontSize * 0.08, renderedWidth, Math.max(1, wordFontSize * 0.07));
        ctx.restore();
        x += width;
      });
    });
    ctx.restore();
    return;
  }

  if (options.runs?.length) {
    const measured = options.runs.map((run) => {
      const runFontSize = fontSize * run.fontScale;
      applyCanvasCaptionFont(ctx, style, runFontSize);
      return { ...run, fontSize: runFontSize, width: ctx.measureText(run.text).width };
    });
    const naturalWidth = measured.reduce((width, run) => width + run.width, 0);
    const fitScale = Math.min(1, maxTextWidth / Math.max(1, naturalWidth));
    const renderedWidth = naturalWidth * fitScale;
    const alignedStart =
      style.textAlign === 'left'
        ? centerX - maxTextWidth / 2
        : style.textAlign === 'right'
          ? centerX + maxTextWidth / 2 - renderedWidth
          : centerX - renderedWidth / 2;
    drawBackdropBlur(
      ctx,
      {
        x: alignedStart - strokeWidth,
        y: centerY - fontSize / 2 - strokeWidth,
        width: renderedWidth + strokeWidth * 2 + extrusion,
        height: fontSize + strokeWidth * 2 + extrusion,
      },
      style.backdropBlur * scale,
    );
    let x = alignedStart;
    ctx.textAlign = 'left';
    for (const run of measured) {
      const runFontSize = run.fontSize * fitScale;
      const runWidth = run.width * fitScale;
      applyCanvasCaptionFont(ctx, style, runFontSize);
      ctx.globalAlpha = run.opacity;
      if (extrusion > 0) {
        ctx.strokeStyle = style.shadowColor || 'rgba(0,0,0,.85)';
        ctx.fillStyle = style.shadowColor || 'rgba(0,0,0,.85)';
        ctx.lineWidth = strokeWidth * 2;
        for (let step = Math.ceil(extrusion); step >= 1; step -= 1) {
          const offset = Math.min(step, extrusion);
          ctx.strokeText(run.text, x + offset, centerY + offset);
          ctx.fillText(run.text, x + offset, centerY + offset);
          ctx.shadowColor = 'transparent';
        }
      }
      if (style.outlineColor !== 'transparent' && strokeWidth > 0) {
        ctx.strokeStyle = style.outlineColor;
        ctx.lineWidth = strokeWidth * 2;
        ctx.strokeText(run.text, x, centerY);
        ctx.shadowColor = 'transparent';
      }
      ctx.fillStyle = style.color || '#ffffff';
      ctx.fillText(run.text, x, centerY);
      if (style.textDecoration === 'line-through') {
        ctx.fillRect(x, centerY - runFontSize * 0.08, runWidth, Math.max(1, runFontSize * 0.07));
      }
      x += runWidth;
    }
    ctx.restore();
    return;
  }

  const firstY = centerY - ((layout.lines.length - 1) * lineHeight) / 2;
  const textX =
    style.textAlign === 'left'
      ? centerX - maxTextWidth / 2
      : style.textAlign === 'right'
        ? centerX + maxTextWidth / 2
        : centerX;
  const textWidth = Math.max(
    1,
    ...layout.lines.map((line) =>
      layout.wrap ? ctx.measureText(line).width : Math.min(maxTextWidth, ctx.measureText(line).width),
    ),
  );
  drawBackdropBlur(
    ctx,
    {
      x:
        (style.textAlign === 'left' ? textX : style.textAlign === 'right' ? textX - textWidth : textX - textWidth / 2) -
        strokeWidth,
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
          ctx.strokeText(line, textX + offset, y + offset);
          ctx.fillText(line, textX + offset, y + offset);
        } else {
          ctx.strokeText(line, textX + offset, y + offset, maxTextWidth);
          ctx.fillText(line, textX + offset, y + offset, maxTextWidth);
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
      if (layout.wrap) ctx.strokeText(line, textX, y);
      else ctx.strokeText(line, textX, y, maxTextWidth);
      ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = style.color || '#ffffff';
    if (layout.wrap) ctx.fillText(line, textX, y);
    else ctx.fillText(line, textX, y, maxTextWidth);
    if (style.textDecoration === 'line-through') {
      const width = Math.min(maxTextWidth, ctx.measureText(line).width);
      const startX =
        style.textAlign === 'left' ? textX : style.textAlign === 'right' ? textX - width : textX - width / 2;
      ctx.fillRect(startX, y - fontSize * 0.08, width, Math.max(1, fontSize * 0.07));
    }
  };
  layout.lines.forEach((line, index) => drawLine(line, firstY + index * lineHeight));
  ctx.restore();
}
