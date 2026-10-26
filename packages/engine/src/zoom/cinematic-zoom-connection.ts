import type { AppliedZoom, ZoomElement, ZoomFocusMapper } from './zoom-types';
import {
  ZOOM_DEPTH_SCALES,
  normalizeZoomProjection,
  normalizeZoomTiltIntensity,
  normalizeZoomTiltAxis,
  DEFAULT_ZOOM_TILT_HORIZONTAL,
  DEFAULT_ZOOM_TILT_VERTICAL,
} from './zoom-types';
import { clampFocusToScale } from './zoom-focus';
import { cinematicProgress, interpolateZoomScale } from './zoom-transitions';
import { cinematicConnectionWindow } from './zoom-connection-window';
import { interpolateOrbitSettings, normalizeOrbitSettings } from './orbit-settings';

/** Connected holds share one continuous pan, including short gaps, without a partial zoom-out. */
export function cinematicZoomConnection(
  current: ZoomElement,
  next: ZoomElement,
  timeMs: number,
  mapFocus: ZoomFocusMapper,
): AppliedZoom | null {
  const handoffWindow = cinematicConnectionWindow(current, next);
  if (!handoffWindow || timeMs < handoffWindow.startMs || timeMs > handoffWindow.endMs) return null;
  const { startMs: start, endMs: end } = handoffWindow;
  const progress = cinematicProgress((timeMs - start) / (end - start));
  const mix = (a: number, b: number) => a + (b - a) * progress;
  const scaleFor = (zoom: ZoomElement) => ZOOM_DEPTH_SCALES[zoom.depth];
  const tiltFor = (zoom: ZoomElement, projection: string) =>
    normalizeZoomProjection(zoom.projection) === projection ? normalizeZoomTiltIntensity(zoom.tiltIntensity) : 0;
  const focusFor = (zoom: ZoomElement) =>
    clampFocusToScale(
      mapFocus(
        zoom.focus,
        {
          focus: zoom.focus,
          mode: zoom.mode,
          scale: scaleFor(zoom),
          strength: 1,
          tilt: tiltFor(zoom, '3d'),
        },
        timeMs,
      ),
      scaleFor(zoom),
    );
  const from = focusFor(current),
    to = focusFor(next);
  const orbit = mix(tiltFor(current, 'orbit'), tiltFor(next, 'orbit'));
  const orbitSettingsFor = (zoom: ZoomElement) => {
    const settings = normalizeOrbitSettings(zoom.orbitSettings);
    return zoom.mode === 'manual' ? { ...settings, horizontal: 0, vertical: 0 } : settings;
  };
  return {
    scale: interpolateZoomScale(scaleFor(current), scaleFor(next), progress),
    focus: { cx: mix(from.cx, to.cx), cy: mix(from.cy, to.cy) },
    strength: 1,
    mode: current.mode === 'auto' || next.mode === 'auto' ? 'auto' : 'manual',
    tracksCursor: false,
    cinematic: true,
    ...(current.timing && next.timing ? { bounded: true } : {}),
    connection: { from: current, to: next, startMs: start, endMs: end, progress },
    tilt: mix(tiltFor(current, '3d'), tiltFor(next, '3d')),
    tiltHorizontal: mix(
      normalizeZoomTiltAxis(current.tiltHorizontal, DEFAULT_ZOOM_TILT_HORIZONTAL),
      normalizeZoomTiltAxis(next.tiltHorizontal, DEFAULT_ZOOM_TILT_HORIZONTAL),
    ),
    tiltVertical: mix(
      normalizeZoomTiltAxis(current.tiltVertical, DEFAULT_ZOOM_TILT_VERTICAL),
      normalizeZoomTiltAxis(next.tiltVertical, DEFAULT_ZOOM_TILT_VERTICAL),
    ),
    ...(orbit
      ? { orbit, orbitSettings: interpolateOrbitSettings(orbitSettingsFor(current), orbitSettingsFor(next), progress) }
      : {}),
  };
}
