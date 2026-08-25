import type { BlurClip, NormalizedTransform, ShapeClip } from '~/media/shared/composition-types';
import { normalizeShapeLayerStyle } from '~/media/shared/shape-layer-style';
import type { ShapeLayerStyle } from '~/media/shared/shape-layer-types';
import type { Canvas2DContext } from '~/types/canvas';
import { applyBlurEffect, type EffectRect } from '../effects/blur-effect';

const shadowOffset = (direction: ShapeClip['shadowDirection'], scale: number) => {
  const distance = 12 * scale;
  if (direction === 'bottom') return { x: 0, y: distance };
  if (direction === 'bottom-right') return { x: distance, y: distance };
  if (direction === 'top-left') return { x: -distance, y: -distance };
  return { x: 0, y: 0 };
};

const traceShape = (ctx: Canvas2DContext, preset: ShapeClip['preset'], style: ShapeLayerStyle) => {
  ctx.beginPath();
  if (preset === 'rectangle') ctx.rect(0, 0, 1, 1);
  else if (preset === 'rounded-rectangle') ctx.roundRect(0, 0, 1, 1, style.cornerRadius / 100);
  else if (preset === 'ellipse') ctx.ellipse(0.5, 0.5, 0.5, 0.5, 0, 0, Math.PI * 2);
  else if (preset === 'triangle') {
    ctx.moveTo(0.5, 0);
    ctx.lineTo(1, 1);
    ctx.lineTo(0, 1);
    ctx.closePath();
  } else if (preset === 'diamond') {
    ctx.moveTo(0.5, 0);
    ctx.lineTo(1, 0.5);
    ctx.lineTo(0.5, 1);
    ctx.lineTo(0, 0.5);
    ctx.closePath();
  } else if (preset === 'star') {
    for (let index = 0; index < 10; index += 1) {
      const angle = -Math.PI / 2 + (index * Math.PI) / 5;
      const radius = index % 2 === 0 ? 0.5 : 0.22;
      const x = 0.5 + Math.cos(angle) * radius;
      const y = 0.5 + Math.sin(angle) * radius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else {
    const halfShaft = 0.06 + (style.arrowThickness / 80) * 0.22;
    const headStart = 0.82 - (style.arrowHeadSize / 70) * 0.32;
    const points = [
      [0, 0.5 - halfShaft],
      [headStart, 0.5 - halfShaft],
      [headStart, 0.08],
      [1, 0.5],
      [headStart, 0.92],
      [headStart, 0.5 + halfShaft],
      [0, 0.5 + halfShaft],
    ] as const;
    for (let index = 0; index < points.length; index += 1) {
      const [x, y] = points[index]!;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
};

const traceShapeInRect = (ctx: Canvas2DContext, rect: EffectRect, style: ShapeLayerStyle) => {
  ctx.save();
  ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
  ctx.rotate((style.rotation * Math.PI) / 180);
  ctx.translate(-rect.width / 2, -rect.height / 2);
  ctx.scale(rect.width, rect.height);
  traceShape(ctx, style.preset, style);
  ctx.restore();
};

const rotatedBounds = (rect: EffectRect, rotation: number): EffectRect => {
  const radians = (rotation * Math.PI) / 180;
  const width = Math.abs(rect.width * Math.cos(radians)) + Math.abs(rect.height * Math.sin(radians));
  const height = Math.abs(rect.width * Math.sin(radians)) + Math.abs(rect.height * Math.cos(radians));
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  };
};

export function drawShapeClip(
  ctx: Canvas2DContext,
  clip: ShapeClip,
  viewport: { x: number; y: number; width: number; height: number },
  transform: NormalizedTransform = clip.transform,
) {
  const rect = {
    x: viewport.x + transform.x * viewport.width,
    y: viewport.y + transform.y * viewport.height,
    width: transform.width * viewport.width,
    height: transform.height * viewport.height,
  };
  if (rect.width <= 0 || rect.height <= 0) return;
  const style = normalizeShapeLayerStyle(clip);
  const scale = Math.min(viewport.width, viewport.height) / 1080;
  if (style.opacityEnabled && style.backdropBlur > 0) {
    const backdropClip: BlurClip = {
      ...clip,
      kind: 'blur',
      shape: 'rectangle',
      mode: 'blur',
      strength: style.backdropBlur,
      feather: 0,
      cornerRadius: 0,
      tintOpacity: 0,
      color: '#000000',
    };
    applyBlurEffect(ctx, backdropClip, rect, {
      bounds: rotatedBounds(rect, style.rotation),
      maskPath: (maskContext, maskRect) => traceShapeInRect(maskContext, maskRect, style),
    });
  }
  ctx.save();
  ctx.globalAlpha *= style.opacityEnabled ? style.opacity / 100 : 1;
  if (style.shadowEnabled) {
    const offset = shadowOffset(style.shadowDirection, scale);
    ctx.shadowColor = style.shadowColor;
    ctx.shadowBlur = style.shadowBlur * scale;
    ctx.shadowOffsetX = offset.x;
    ctx.shadowOffsetY = offset.y;
  }
  traceShapeInRect(ctx, rect, style);
  ctx.fillStyle = style.fillColor;
  ctx.fill();
  if (style.borderWidth > 0) {
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = style.borderColor;
    ctx.lineWidth = style.borderWidth * scale;
    ctx.stroke();
  }
  ctx.restore();
}
