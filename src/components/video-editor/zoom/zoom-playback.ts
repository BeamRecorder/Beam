import type { CursorTelemetryPoint } from '../../../api/types/capture-session';
import {
  DEFAULT_ZOOM_TILT_HORIZONTAL,
  DEFAULT_ZOOM_TILT_VERTICAL,
  normalizeZoomProjection,
  normalizeZoomTiltAxis,
  normalizeZoomTiltIntensity,
  ZOOM_DEPTH_SCALES,
  type ZoomElement,
  type ZoomFocus,
} from './zoom-types';

export interface AppliedZoom {
  scale: number;
  focus: ZoomFocus;
  strength: number;
  mode: ZoomElement['mode'];
  tilt: number;
  tiltHorizontal?: number;
  tiltVertical?: number;
}
export type ZoomFocusMapper = (focus: ZoomFocus, zoom: AppliedZoom, timeMs: number) => ZoomFocus;
export const ZOOM_IN_MS = 1522.575;
export const ZOOM_OUT_MS = 1015.05;
const LEAD_MS = 200;
const IN_OVERLAP_MS = 1000;
const OUT_EARLY_MS = 500;
const CONNECTED_GAP_MS = 1350;
const CONNECTED_PAN_MS = 1000;
const CURSOR_SMOOTHING_MS = 180;
const CURSOR_HISTORY_MS = 600;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOut = (value: number) => 1 - (1 - clamp01(value)) ** 3;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const tiltFor = (zoom: ZoomElement) =>
  normalizeZoomProjection(zoom.projection) === '3d' ? normalizeZoomTiltIntensity(zoom.tiltIntensity) : 0;
const horizontalTiltFor = (zoom: ZoomElement) =>
  normalizeZoomTiltAxis(zoom.tiltHorizontal, DEFAULT_ZOOM_TILT_HORIZONTAL);
const verticalTiltFor = (zoom: ZoomElement) => normalizeZoomTiltAxis(zoom.tiltVertical, DEFAULT_ZOOM_TILT_VERTICAL);

export function clampFocusToScale(focus: ZoomFocus, scale: number): ZoomFocus {
  const margin = 1 / (2 * Math.max(1, scale));
  return { cx: Math.min(1 - margin, Math.max(margin, focus.cx)), cy: Math.min(1 - margin, Math.max(margin, focus.cy)) };
}

export function regionStrength(region: ZoomElement, timeMs: number): number {
  const adjusted = timeMs - LEAD_MS;
  const inStart = region.startMs + IN_OVERLAP_MS - ZOOM_IN_MS;
  let inEnd = inStart + ZOOM_IN_MS;
  let outStart = region.endMs - OUT_EARLY_MS;
  if (inEnd > outStart) {
    const midpoint = (inEnd + outStart) / 2;
    inEnd = midpoint;
    outStart = midpoint;
  }
  if (adjusted < inStart || adjusted > outStart + ZOOM_OUT_MS) return 0;
  if (adjusted < inEnd) return easeOut((adjusted - inStart) / Math.max(1, inEnd - inStart));
  if (adjusted <= outStart) return 1;
  return 1 - easeOut((adjusted - outStart) / ZOOM_OUT_MS);
}

export function cursorFocusAt(samples: readonly CursorTelemetryPoint[], timeMs: number): ZoomFocus | null {
  let lower = 0;
  let upper = samples.length - 1;
  let previousIndex = -1;
  while (lower <= upper) {
    const middle = (lower + upper) >> 1;
    if (samples[middle]!.timeMs <= timeMs) {
      previousIndex = middle;
      lower = middle + 1;
    } else upper = middle - 1;
  }
  const previous = previousIndex >= 0 ? samples[previousIndex] : undefined;
  const next = samples[previousIndex + 1];
  if (!previous) return next ? { cx: next.cx, cy: next.cy } : null;
  if (!next) return { cx: previous.cx, cy: previous.cy };
  const t = (timeMs - previous.timeMs) / Math.max(1, next.timeMs - previous.timeMs);
  return { cx: lerp(previous.cx, next.cx, t), cy: lerp(previous.cy, next.cy, t) };
}

/** Smooths recorded cursor samples so a fast cross-screen movement pans the camera instead of snapping it. */
export function smoothedCursorFocusAt(samples: readonly CursorTelemetryPoint[], timeMs: number): ZoomFocus | null {
  const current = cursorFocusAt(samples, timeMs);
  if (!current) return null;
  let totalWeight = 1;
  let weightedX = current.cx;
  let weightedY = current.cy;
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const sample = samples[index];
    if (sample.timeMs >= timeMs) continue;
    const ageMs = timeMs - sample.timeMs;
    if (ageMs > CURSOR_HISTORY_MS) break;
    const weight = Math.exp(-ageMs / CURSOR_SMOOTHING_MS);
    totalWeight += weight;
    weightedX += sample.cx * weight;
    weightedY += sample.cy * weight;
  }
  return { cx: weightedX / totalWeight, cy: weightedY / totalWeight };
}

function zoomAtSortedTime(
  elements: readonly ZoomElement[],
  timeMs: number,
  telemetry: readonly CursorTelemetryPoint[],
  mapFocus: ZoomFocusMapper = (focus) => focus,
): AppliedZoom | null {
  const pair = elements.find((current, index) => {
    const next = elements[index + 1];
    return (
      next &&
      next.startMs - current.endMs <= CONNECTED_GAP_MS &&
      timeMs >= current.endMs + LEAD_MS &&
      timeMs <= current.endMs + LEAD_MS + CONNECTED_PAN_MS
    );
  });
  if (pair) {
    const next = elements.find(
      (candidate) => candidate.startMs >= pair.endMs && candidate.startMs - pair.endMs <= CONNECTED_GAP_MS,
    );
    if (next) {
      const t = easeOut((timeMs - pair.endMs - LEAD_MS) / CONNECTED_PAN_MS);
      const transitionStrength = lerp(regionStrength(pair, timeMs), 1, t);
      const startScale = ZOOM_DEPTH_SCALES[pair.depth];
      const endScale = ZOOM_DEPTH_SCALES[next.depth];
      const startFocus = clampFocusToScale(
        mapFocus(
          pair.focus,
          { focus: pair.focus, mode: pair.mode, scale: startScale, strength: 1, tilt: tiltFor(pair) },
          timeMs,
        ),
        startScale,
      );
      const endFocus = clampFocusToScale(
        mapFocus(
          next.focus,
          { focus: next.focus, mode: next.mode, scale: endScale, strength: 1, tilt: tiltFor(next) },
          timeMs,
        ),
        endScale,
      );
      return {
        scale: lerp(startScale, endScale, t),
        focus: { cx: lerp(startFocus.cx, endFocus.cx, t), cy: lerp(startFocus.cy, endFocus.cy, t) },
        strength: 1,
        mode: pair.mode === 'auto' || next.mode === 'auto' ? 'auto' : 'manual',
        tilt: lerp(tiltFor(pair), tiltFor(next), t) * transitionStrength,
        tiltHorizontal: lerp(horizontalTiltFor(pair), horizontalTiltFor(next), t),
        tiltVertical: lerp(verticalTiltFor(pair), verticalTiltFor(next), t),
      };
    }
  }
  let current: { element: ZoomElement; strength: number } | null = null;
  for (const element of elements) {
    const strength = regionStrength(element, timeMs);
    if (strength <= 0) continue;
    if (
      !current ||
      strength > current.strength ||
      (strength === current.strength && element.startMs > current.element.startMs)
    )
      current = { element, strength };
  }
  if (!current) return null;
  const currentScale = ZOOM_DEPTH_SCALES[current.element.depth];
  const next = elements.find(
    (candidate) =>
      candidate.startMs >= current.element.endMs && candidate.startMs - current.element.endMs <= CONNECTED_GAP_MS,
  );
  let focus = clampFocusToScale(
    mapFocus(
      current.element.focus,
      {
        focus: current.element.focus,
        scale: currentScale,
        strength: current.strength,
        mode: current.element.mode,
        tilt: tiltFor(current.element) * current.strength,
      },
      timeMs,
    ),
    currentScale,
  );
  let scale = currentScale;
  if (
    next &&
    timeMs >= current.element.endMs + LEAD_MS &&
    timeMs <= current.element.endMs + LEAD_MS + CONNECTED_PAN_MS
  ) {
    const t = easeOut((timeMs - current.element.endMs - LEAD_MS) / CONNECTED_PAN_MS);
    const nextScale = ZOOM_DEPTH_SCALES[next.depth];
    const nextFocus = clampFocusToScale(
      mapFocus(
        next.focus,
        { focus: next.focus, scale: nextScale, strength: 1, mode: next.mode, tilt: tiltFor(next) },
        timeMs,
      ),
      nextScale,
    );
    focus = {
      cx: lerp(focus.cx, nextFocus.cx, t),
      cy: lerp(focus.cy, nextFocus.cy, t),
    };
    scale = lerp(scale, nextScale, t);
    return {
      scale,
      focus,
      strength: current.strength,
      mode: current.element.mode === 'auto' || next.mode === 'auto' ? 'auto' : 'manual',
      tilt: lerp(tiltFor(current.element), tiltFor(next), t),
      tiltHorizontal: lerp(horizontalTiltFor(current.element), horizontalTiltFor(next), t),
      tiltVertical: lerp(verticalTiltFor(current.element), verticalTiltFor(next), t),
    };
  } else if (current.element.mode === 'auto') {
    const cursor = smoothedCursorFocusAt(telemetry, timeMs);
    if (cursor)
      focus = clampFocusToScale(
        mapFocus(
          cursor,
          { focus: cursor, scale, strength: current.strength, mode: 'auto', tilt: tiltFor(current.element) },
          timeMs,
        ),
        scale,
      );
  }
  return {
    scale: 1 + (scale - 1) * current.strength,
    focus,
    strength: current.strength,
    mode: current.element.mode,
    tilt: tiltFor(current.element) * current.strength,
    tiltHorizontal: horizontalTiltFor(current.element),
    tiltVertical: verticalTiltFor(current.element),
  };
}

export function createZoomTimeEvaluator(
  elements: readonly ZoomElement[],
  telemetry: readonly CursorTelemetryPoint[] = [],
  mapFocus?: ZoomFocusMapper,
) {
  const sortedElements = [...elements].sort((left, right) => left.startMs - right.startMs);
  const sortedTelemetry = [...telemetry].sort((left, right) => left.timeMs - right.timeMs);
  return (timeMs: number) => zoomAtSortedTime(sortedElements, timeMs, sortedTelemetry, mapFocus);
}

export function zoomAtTime(
  elements: readonly ZoomElement[],
  timeMs: number,
  telemetry: readonly CursorTelemetryPoint[] = [],
): AppliedZoom | null {
  return createZoomTimeEvaluator(elements, telemetry)(timeMs);
}
