import type { ShapeClip } from '@beam/engine/shared/composition-types';
import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import { elementTextCaption, elementTextLayout } from '@beam/engine/shared/element-text';
import { applyCanvasCaptionFont } from '@beam/runtime/shared/caption-font-render';
import { traceFreehand } from '@beam/runtime/shared/freehand-render';
import { shapeLayerFill } from '@beam/engine/shared/shape-layer-style';
import { drawCaptionText } from '@beam/runtime/composition/captions/render-caption-text';
import { backgroundFillStyle } from '@beam/runtime/composition/background/render-background';
import { lineBoxBaselineOffset } from '@beam/runtime/shared/text-line-box';

export const elementTextCanvas = (viewport: { width: number; height: number }) => {
  const scale = 1080 / Math.max(1, Math.min(viewport.width, viewport.height));
  return { width: viewport.width * scale, height: viewport.height * scale };
};

export function drawElementText(
  ctx: Canvas2DContext,
  clip: ShapeClip,
  viewport: { x: number; y: number; width: number; height: number },
) {
  if (!clip.text?.content) return;
  const canvas = elementTextCanvas(viewport);
  ctx.save();
  applyCanvasCaptionFont(ctx, clip.text.style);
  const layout = elementTextLayout(clip, canvas, (text) => ctx.measureText(text).width);
  const cx = viewport.x + (clip.transform.x + clip.transform.width / 2) * viewport.width;
  const cy = viewport.y + (clip.transform.y + clip.transform.height / 2) * viewport.height;
  ctx.textBaseline = 'middle';
  const baselineOffset = lineBoxBaselineOffset(ctx.measureText(clip.text.content)) * (viewport.width / canvas.width);
  ctx.translate(cx, cy);
  ctx.rotate((clip.rotation * Math.PI) / 180);
  ctx.translate(-cx, -cy);
  ctx.translate(0, baselineOffset);
  drawCaptionText(ctx, { clip: elementTextCaption(clip, layout), text: clip.text.content, canvas, viewport });
  ctx.restore();
}

export function drawFreehand(
  ctx: Canvas2DContext,
  clip: ShapeClip,
  rect: { x: number; y: number; width: number; height: number },
  scale: number,
) {
  if (!clip.drawing) return;
  ctx.save();
  ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
  ctx.rotate((clip.rotation * Math.PI) / 180);
  ctx.translate(-rect.width / 2, -rect.height / 2);
  traceFreehand(ctx, clip.drawing, rect.width, rect.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const width = clip.drawing.strokeWidth * scale;
  if (clip.borderWidth > 0) {
    ctx.strokeStyle = clip.borderColor;
    ctx.lineWidth = width + 2 * clip.borderWidth * scale;
    ctx.stroke();
    ctx.shadowColor = 'transparent';
  }
  ctx.strokeStyle = backgroundFillStyle(ctx, shapeLayerFill(clip), {
    x: 0,
    y: 0,
    width: rect.width,
    height: rect.height,
  });
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.restore();
}
