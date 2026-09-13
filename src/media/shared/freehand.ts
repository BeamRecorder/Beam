import type { Canvas2DContext } from '~/types/canvas';
import type { DrawingPoint, DrawingSettings, DrawnElement, FreehandDrawing } from './element-types';
import { smoothFreehandPoints } from './freehand-smoothing';

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

/** Reconstruct a regular curve from the gesture, then trace it with cubic tangents. */
export function traceFreehand(ctx: Canvas2DContext, drawing: FreehandDrawing, width: number, height: number) {
  const points = smoothFreehandPoints(drawing.points, drawing.smoothing, width, height);
  if (!points.length) return;
  const first = points[0]!;
  ctx.beginPath();
  ctx.moveTo(first.x * width, first.y * height);
  if (points.length === 1) {
    ctx.lineTo(first.x * width + 0.01, first.y * height);
    return;
  }
  const smooth = drawing.smoothing / 100;
  if (smooth === 0) {
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x * width, points[i]!.y * height);
    return;
  }
  // Use the gesture's bounds so preview and the cropped element have identical controls.
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const minX = Math.max(0, Math.min(...xs)),
    maxX = Math.min(1, Math.max(...xs));
  const minY = Math.max(0, Math.min(...ys)),
    maxY = Math.min(1, Math.max(...ys));
  const last = points[points.length - 1]!;
  const closed = points.length > 3 && Math.hypot(first.x - last.x, first.y - last.y) < 1e-9;
  const control = (start: number, linear: number, tangent: number, min: number, max: number) =>
    Math.max(min, Math.min(max, start + linear * (1 - smooth) + tangent * smooth));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!;
    const prev = points[closed && i === 1 ? points.length - 2 : Math.max(0, i - 2)]!,
      next = points[closed && i === points.length - 1 ? 1 : Math.min(points.length - 1, i + 1)]!;
    ctx.bezierCurveTo(
      control(a.x, (b.x - a.x) / 3, (b.x - prev.x) / 6, minX, maxX) * width,
      control(a.y, (b.y - a.y) / 3, (b.y - prev.y) / 6, minY, maxY) * height,
      control(b.x, (a.x - b.x) / 3, -(next.x - a.x) / 6, minX, maxX) * width,
      control(b.y, (a.y - b.y) / 3, -(next.y - a.y) / 6, minY, maxY) * height,
      b.x * width,
      b.y * height,
    );
  }
}
