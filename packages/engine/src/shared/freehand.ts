import type { DrawingPoint, DrawingSettings, DrawnElement, FreehandDrawing } from '@beam/engine/shared/element-types';

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
