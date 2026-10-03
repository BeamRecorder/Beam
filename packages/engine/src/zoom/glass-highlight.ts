import type { ZoomElement } from './zoom-types';
import { ZOOM_DEPTH_SCALES } from './zoom-types';
import type { GlassHighlightSample, GlassPoint, GlassHighlightSettings } from './glass-highlight-types';
import { DEFAULT_GLASS_HIGHLIGHT, GLASS_MAX_POINTS } from './glass-highlight-schema.js';

export { DEFAULT_GLASS_HIGHLIGHT, GLASS_MAX_POINTS } from './glass-highlight-schema.js';

export function createGlassHighlight(): GlassHighlightSettings {
  return { ...DEFAULT_GLASS_HIGHLIGHT, path: [] };
}

/** Absolute-time evaluation, with no playback state or camera pan/zoom side effects. */
export function glassHighlightsAt(
  elements: readonly ZoomElement[],
  timeMs: number,
  width: number,
  height: number,
): GlassHighlightSample[] {
  const result: GlassHighlightSample[] = [];
  for (const zoom of elements) {
    const settings = zoom.glass;
    if (
      zoom.effect !== 'glass' ||
      zoom.enabled === false ||
      !settings ||
      (settings.shape === 'freehand' && settings.path.length < 3) ||
      timeMs < zoom.startMs ||
      timeMs >= zoom.endMs
    )
      continue;
    const fade = Math.min(settings.transitionMs, (zoom.endMs - zoom.startMs) / 2);
    const progress = fade === 0 ? 1 : Math.min(1, (timeMs - zoom.startMs) / fade, (zoom.endMs - timeMs) / fade);
    const strength = progress * progress * (3 - 2 * progress);
    if (strength <= 0 || settings.opacity <= 0) continue;
    result.push({
      id: zoom.id,
      center: { x: zoom.focus.cx * width, y: zoom.focus.cy * height },
      radius: (settings.size * Math.min(width, height)) / 2,
      magnification: 1 + (ZOOM_DEPTH_SCALES[zoom.depth] - 1) * strength,
      strength,
      settings,
    });
  }
  return result;
}

/** Arc-length sampling keeps the JSON and shader uniform budget bounded. */
export function fitGlassContour(points: readonly GlassPoint[], width: number, height: number) {
  if (
    points.length < 3 ||
    points.length > 8192 ||
    ![width, height].every((value) => Number.isFinite(value) && value > 0) ||
    points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))
  )
    return null;
  const pixelPoints = points.map((point) => ({
    x: Math.min(1, Math.max(0, point.x)) * width,
    y: Math.min(1, Math.max(0, point.y)) * height,
  }));
  const xs = pixelPoints.map((point) => point.x),
    ys = pixelPoints.map((point) => point.y);
  const left = Math.min(...xs),
    right = Math.max(...xs),
    top = Math.min(...ys),
    bottom = Math.max(...ys);
  const diameter = Math.max(right - left, bottom - top);
  if (diameter > Math.min(width, height) * 4) return null;
  if (Math.min(right - left, bottom - top) < 4 || diameter < Math.min(width, height) * 0.02) return null;
  const area = pixelPoints.reduce((sum, point, i) => {
    const next = pixelPoints[(i + 1) % pixelPoints.length]!;
    return sum + point.x * next.y - point.y * next.x;
  }, 0);
  if (Math.abs(area) < 8) return null;
  const center = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const radius = diameter / 2;
  const distances = [0];
  for (let i = 1; i <= pixelPoints.length; i++) {
    const previous = pixelPoints[i - 1]!,
      current = pixelPoints[i % pixelPoints.length]!;
    distances.push(distances[i - 1]! + Math.hypot(current.x - previous.x, current.y - previous.y));
  }
  const length = distances[distances.length - 1]!;
  const count = Math.min(GLASS_MAX_POINTS, pixelPoints.length);
  const path: GlassPoint[] = [];
  let segment = 1;
  for (let i = 0; i < count; i++) {
    const distance = (length * i) / count;
    while (segment < distances.length - 1 && distances[segment]! < distance) segment++;
    const start = pixelPoints[segment - 1]!,
      end = pixelPoints[segment % pixelPoints.length]!;
    const fraction =
      (distance - distances[segment - 1]!) / Math.max(1e-6, distances[segment]! - distances[segment - 1]!);
    path.push({
      x: (start.x + (end.x - start.x) * fraction - center.x) / radius,
      y: (start.y + (end.y - start.y) * fraction - center.y) / radius,
    });
  }
  return {
    focus: { cx: center.x / width, cy: center.y / height },
    size: Math.min(4, diameter / Math.min(width, height)),
    path,
  };
}
