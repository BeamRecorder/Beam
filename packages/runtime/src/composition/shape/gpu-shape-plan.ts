import type { NormalizedTransform, ShapeClip } from '@beam/engine/shared/composition-types';
import { shapeLayerFill } from '@beam/engine/shared/shape-layer-style';
import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import type { GpuColor, GpuSceneCommand } from '@beam/runtime/gpu/gpu-scene-types';
import type { CachedGpuShapePlan, GpuShapePaintContext } from '@beam/runtime/composition/shape/gpu-shape-plan-types';
import { shapePaintStyle } from './shape-paint-style';

const plans = new WeakMap<ShapeClip, CachedGpuShapePlan>();
const color = (hex: string): GpuColor | null => {
  if (!/^#[\da-f]{6}(?:ff)?$/i.test(hex)) return null;
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
    1,
  ];
};
/** Only pixel-aligned, opaque rectangular paint is equivalent to a GPU solid union.
 * Fractional antialiasing, text, shadows, blends and live backdrops keep their native renderer. */
export function gpuShapePlan(
  ctx: Canvas2DContext,
  clip: ShapeClip,
  viewport: { x: number; y: number; width: number; height: number },
  transform: NormalizedTransform = clip.transform,
  paint?: GpuShapePaintContext,
): GpuSceneCommand[] | null {
  const m = paint?.matrix ?? ctx.getTransform();
  if (
    ctx.globalAlpha !== 1 ||
    ctx.globalCompositeOperation !== 'source-over' ||
    ctx.filter !== 'none' ||
    ctx.shadowBlur !== 0 ||
    ctx.shadowOffsetX !== 0 ||
    ctx.shadowOffsetY !== 0 ||
    m.b !== 0 ||
    m.c !== 0 ||
    m.a <= 0 ||
    m.d !== m.a ||
    clip.transitions?.entry ||
    clip.transitions?.exit
  )
    return null;
  const key = paint?.key ?? JSON.stringify([viewport, m.a, m.d, m.e, m.f, ctx.canvas.width, ctx.canvas.height]);
  const style = shapePaintStyle(clip);
  const cached = plans.get(clip);
  if (
    cached?.key === key &&
    cached.style === style &&
    cached.transform.x === transform.x &&
    cached.transform.y === transform.y &&
    cached.transform.width === transform.width &&
    cached.transform.height === transform.height
  )
    return cached.commands;
  const fill = shapeLayerFill(style);
  let commands: GpuSceneCommand[] | null = null;
  if (
    style.family === 'shape' &&
    style.preset === 'rectangle' &&
    style.rotation === 0 &&
    !clip.text &&
    !style.vector &&
    !style.shadowEnabled &&
    (!style.opacityEnabled || (style.opacity === 100 && style.backdropBlur === 0)) &&
    fill.kind === 'color'
  ) {
    const x = (viewport.x + transform.x * viewport.width) * m.a + m.e,
      y = (viewport.y + transform.y * viewport.height) * m.d + m.f;
    const w = transform.width * viewport.width * m.a,
      h = transform.height * viewport.height * m.d;
    const b = ((style.borderWidth * Math.min(viewport.width, viewport.height)) / 1080) * m.a,
      half = b / 2;
    // Outside the physical target, even the stroked edge and its AA fringe cannot contribute pixels.
    // Keep the document intact and skip only this paint; camera/keyframe changes reevaluate the bounds.
    if (
      w > 0 &&
      h > 0 &&
      (x + w + half < -1 || y + h + half < -1 || x - half > ctx.canvas.width + 1 || y - half > ctx.canvas.height + 1)
    ) {
      commands = [];
      plans.set(clip, { key, transform: { ...transform }, style, commands });
      return commands;
    }
    const fillColor = color(fill.color),
      borderColor = color(style.borderColor);
    // Leave native clipping edges untouched: batching must not collapse repeated AA coverage.
    const inset = 32 * m.a;
    const inside =
      x - half > viewport.x * m.a + m.e + inset &&
      y - half > viewport.y * m.d + m.f + inset &&
      x + w + half < (viewport.x + viewport.width) * m.a + m.e - inset &&
      y + h + half < (viewport.y + viewport.height) * m.d + m.f - inset;
    if (
      inside &&
      // Normalized coordinates can return 47.99999999999999 at a true pixel edge.
      // This is below Canvas/GL float precision, unlike real fractional antialiasing.
      [x, y, w, h, x - half, y - half, x + w + half, y + h + half].every((v) => Math.abs(v - Math.round(v)) < 1e-7) &&
      w > 0 &&
      h > 0 &&
      b <= Math.min(w, h) &&
      fillColor &&
      borderColor
    ) {
      commands = [];
      const solid = (x: number, y: number, width: number, height: number, color: GpuColor) =>
        commands!.push({
          kind: 'solid',
          rect: { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) },
          color,
        });
      if (style.fillEnabled) solid(x, y, w, h, fillColor);
      if (b > 0) {
        solid(x - half, y - half, w + b, b, borderColor);
        solid(x - half, y + h - half, w + b, b, borderColor);
        solid(x - half, y + half, b, h - b, borderColor);
        solid(x + w - half, y + half, b, h - b, borderColor);
      }
    }
  }
  plans.set(clip, { key, transform: { ...transform }, style, commands });
  return commands;
}
