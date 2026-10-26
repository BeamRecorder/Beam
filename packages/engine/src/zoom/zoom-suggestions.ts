import type { CursorTelemetryPoint } from '../capture/capture-session';
import {
  DEFAULT_ZOOM_TILT_HORIZONTAL,
  DEFAULT_ZOOM_TILT_INTENSITY,
  DEFAULT_ZOOM_TILT_VERTICAL,
  type ZoomElement,
} from './zoom-types';
import { suggestAutomaticTilt } from './automatic-tilt';
import { planZoomShots } from './zoom-shot-planner';
import type { ZoomShotBounds } from './zoom-shot-types';
import { boundGeneratedZooms } from './zoom-generated-timing';

// Action grouping is unchanged; versioned timing must not regenerate saved version-13 plans.
export const ZOOM_ALGORITHM_VERSION = 13;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizeCursorTelemetry(
  samples: readonly CursorTelemetryPoint[],
  durationMs: number,
): CursorTelemetryPoint[] {
  return samples
    .filter((sample) => [sample.timeMs, sample.cx, sample.cy].every(Number.isFinite))
    .map((sample) => ({
      ...sample,
      timeMs: clamp(sample.timeMs, 0, durationMs),
      cx: clamp(sample.cx, 0, 1),
      cy: clamp(sample.cy, 0, 1),
    }))
    .sort((a, b) => a.timeMs - b.timeMs);
}

export function buildAutomaticZoomElements(params: {
  telemetry: CursorTelemetryPoint[];
  sessionId: string;
  durationMs: number;
  reserved?: ZoomElement[];
  bounds?: ZoomShotBounds;
}): ZoomElement[] {
  const telemetry = normalizeCursorTelemetry(params.telemetry, params.durationMs);
  return boundGeneratedZooms(
    planZoomShots({ ...params, telemetry }).map((shot) => {
      const tilt = suggestAutomaticTilt(telemetry, shot.firstClickMs, shot.focus);
      return {
        id: `auto:${params.sessionId}:${Math.round(shot.firstClickMs)}`,
        sessionId: params.sessionId,
        startMs: Math.ceil(shot.startMs),
        endMs: Math.floor(shot.endMs),
        focus: shot.focus,
        depth: shot.depth,
        mode: 'auto',
        projection: '2d',
        transition: 'cinematic',
        generation: 'automatic',
        tiltIntensity: tilt?.intensity ?? DEFAULT_ZOOM_TILT_INTENSITY,
        tiltHorizontal: tilt?.horizontal ?? DEFAULT_ZOOM_TILT_HORIZONTAL,
        tiltVertical: tilt?.vertical ?? DEFAULT_ZOOM_TILT_VERTICAL,
        tiltPreset: 'custom',
      };
    }),
    params.durationMs,
  );
}
