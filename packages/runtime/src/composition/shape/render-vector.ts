import type { ShapeClip } from '@beam/engine/shared/composition-types';
import type { ShapeLayerStyle } from '@beam/engine/shared/shape-layer-types';
import { shapeLayerFill } from '@beam/engine/shared/shape-layer-style';
import { vectorPathData } from '@beam/engine/shared/shape-vector-svg';
import { vectorStrokePathData } from '@beam/engine/shared/shape-vector-stroke';
import { vectorMarkerPaths } from '@beam/engine/shared/shape-vector-markers';
import type { Canvas2DContext } from '../../canvas-types';
import type { EffectRect } from '../effects/effect-types';
import { backgroundFillStyle } from '../background/render-background';
import type { VectorPaintPaths } from './vector-paint-types';

const paths = new WeakMap<ShapeClip, VectorPaintPaths>();

export function vectorPaintPaths(clip: ShapeClip, rect: EffectRect, style: ShapeLayerStyle, scale: number) {
  const vector = style.vector!;
  const key = JSON.stringify([rect, style.rotation, scale]);
  const cached = paths.get(clip);
  if (cached?.vector === vector && cached.key === key) return cached;
  const matrix = new DOMMatrix()
    .translateSelf(rect.x + rect.width / 2, rect.y + rect.height / 2)
    .rotateSelf(style.rotation)
    .translateSelf(-rect.width / 2, -rect.height / 2);
  const transform = (data: string) => {
    const p = new Path2D();
    p.addPath(new Path2D(data), matrix);
    return p;
  };
  const markers = vectorMarkerPaths(vector, rect.width, rect.height, scale);
  const result: VectorPaintPaths = {
    key,
    vector,
    closed: transform(
      vectorPathData({ ...vector, contours: vector.contours.filter((c) => c.closed) }, rect.width, rect.height),
    ),
    open: transform(
      vectorStrokePathData(
        { ...vector, contours: vector.contours.filter((c) => !c.closed) },
        rect.width,
        rect.height,
        scale,
      ),
    ),
    filledMarkers: transform(markers.filled),
    openMarkers: transform(markers.outlined),
  };
  paths.set(clip, result);
  return result;
}

export function drawVector(
  ctx: Canvas2DContext,
  clip: ShapeClip,
  rect: EffectRect,
  style: ShapeLayerStyle,
  scale: number,
) {
  const vector = style.vector!,
    paint = vectorPaintPaths(clip, rect, style, scale);
  const shaftCap = vector.startMarker !== 'none' || vector.endMarker !== 'none' ? 'butt' : 'round';
  const shadow = ctx.shadowColor;
  const fill = backgroundFillStyle(ctx, shapeLayerFill(style), rect);
  ctx.lineCap = ctx.lineJoin = 'round';
  if (style.fillEnabled !== false) {
    ctx.fillStyle = fill;
    ctx.fill(paint.closed, vector.fillRule);
  }
  if (style.borderWidth > 0) {
    if (style.fillEnabled !== false) ctx.shadowColor = 'transparent';
    ctx.strokeStyle = style.borderColor;
    ctx.lineWidth = style.borderWidth * scale;
    ctx.stroke(paint.closed);
    ctx.shadowColor = shadow;
    ctx.stroke(paint.filledMarkers);
    ctx.lineWidth = (vector.strokeWidth + 2 * style.borderWidth) * scale;
    ctx.lineCap = shaftCap;
    ctx.stroke(paint.open);
    ctx.lineCap = 'round';
    ctx.stroke(paint.openMarkers);
    if (style.fillEnabled !== false) ctx.shadowColor = 'transparent';
  }
  if (style.fillEnabled !== false) {
    ctx.strokeStyle = fill;
    ctx.lineWidth = vector.strokeWidth * scale;
    ctx.lineCap = shaftCap;
    ctx.stroke(paint.open);
    ctx.lineCap = 'round';
    ctx.fillStyle = fill;
    ctx.fill(paint.filledMarkers);
    ctx.stroke(paint.openMarkers);
  }
}
