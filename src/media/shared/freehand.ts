import type { Canvas2DContext } from '~/types/canvas';
import type { DrawingPoint, DrawingSettings, DrawnElement, FreehandDrawing } from './element-types';

export const MAX_DRAWING_POINTS = 8192;
export const DEFAULT_DRAWING_SETTINGS: DrawingSettings = { smoothing: 65, strokeWidth: 8, color: '#ff5a1f' };

export function isFreehandDrawing(value: FreehandDrawing): boolean {
  return Boolean(
    value &&
    Array.isArray(value.points) &&
    value.points.length > 0 &&
    value.points.length <= MAX_DRAWING_POINTS &&
    value.points.every((p) => p && [p.x, p.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) &&
    Number.isFinite(value.smoothing) &&
    value.smoothing >= 0 &&
    value.smoothing <= 100 &&
    Number.isFinite(value.strokeWidth) &&
    value.strokeWidth >= 1 &&
    value.strokeWidth <= 120,
  );
}

export function finishDrawing(
  points: readonly DrawingPoint[],
  settings: DrawingSettings,
  canvas: { width: number; height: number },
): DrawnElement | null {
  if (!points.length || canvas.width <= 0 || canvas.height <= 0) return null;
  const sampled = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).slice(0, MAX_DRAWING_POINTS);
  if (!sampled.length) return null;
  const xs = sampled.map((p) => p.x),
    ys = sampled.map((p) => p.y);
  const padding = ((settings.strokeWidth / 2) * Math.min(canvas.width, canvas.height)) / 1080;
  const x = Math.min(...xs) - padding / canvas.width,
    y = Math.min(...ys) - padding / canvas.height;
  const width = Math.max(1 / canvas.width, Math.max(...xs) - x + padding / canvas.width);
  const height = Math.max(1 / canvas.height, Math.max(...ys) - y + padding / canvas.height);
  return {
    transform: { x, y, width, height },
    drawing: {
      points: sampled.map((p) => ({ x: (p.x - x) / width, y: (p.y - y) / height })),
      smoothing: settings.smoothing,
      strokeWidth: settings.strokeWidth,
    },
  };
}

/** Catmull–Rom tangents blended with straight segments. Bounds remain inside the editable rectangle. */
export function traceFreehand(ctx: Canvas2DContext, drawing: FreehandDrawing, width: number, height: number) {
  const points = drawing.points;
  if (!points.length) return;
  const first = points[0]!;
  ctx.beginPath();
  ctx.moveTo(first.x * width, first.y * height);
  if (points.length === 1) {
    ctx.lineTo(first.x * width + 0.01, first.y * height);
    return;
  }
  const smooth = drawing.smoothing / 100;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!;
    if (smooth === 0) {
      ctx.lineTo(b.x * width, b.y * height);
      continue;
    }
    const prev = points[Math.max(0, i - 2)]!,
      next = points[Math.min(points.length - 1, i + 1)]!;
    const control = (start: number, linear: number, tangent: number) =>
      clamp(start + linear * (1 - smooth) + tangent * smooth);
    ctx.bezierCurveTo(
      control(a.x, (b.x - a.x) / 3, (b.x - prev.x) / 6) * width,
      control(a.y, (b.y - a.y) / 3, (b.y - prev.y) / 6) * height,
      control(b.x, (a.x - b.x) / 3, -(next.x - a.x) / 6) * width,
      control(b.y, (a.y - b.y) / 3, -(next.y - a.y) / 6) * height,
      b.x * width,
      b.y * height,
    );
  }
}
