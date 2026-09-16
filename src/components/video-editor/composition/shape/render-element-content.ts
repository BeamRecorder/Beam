import type { ShapeClip } from '~/media/shared/composition-types';
import type { Canvas2DContext } from '~/types/canvas';
import { elementTextCaption, elementTextLayout } from '~/media/shared/element-text';
import { applyCanvasCaptionFont } from '~/media/shared/caption-font';
import { traceFreehand } from '~/media/shared/freehand';
import { shapeLayerFill } from '~/media/shared/shape-layer-style';
import { drawCaptionText } from '../captions/render-caption-text';
import { backgroundFillStyle } from '../background/render-background';

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
  ctx.translate(cx, cy);
  ctx.rotate((clip.rotation * Math.PI) / 180);
  ctx.translate(-cx, -cy);
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
