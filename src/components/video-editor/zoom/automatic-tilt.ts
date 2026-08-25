import type { CursorTelemetryPoint } from '../../../api/types/capture-session';
import type { ZoomFocus } from './zoom-types';

const APPROACH_WINDOW_MS = 700;
const RECENT_DEAD_ZONE_MS = 60;
const ORIGIN_SAMPLE_WINDOW_MS = 160;
const MIN_APPROACH_DISTANCE = 0.035;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export interface AutomaticTiltSuggestion {
  intensity: number;
  horizontal: number;
  vertical: number;
}

export function suggestAutomaticTilt(
  telemetry: readonly CursorTelemetryPoint[],
  clickTimeMs: number,
  focus: ZoomFocus,
): AutomaticTiltSuggestion | null {
  const approach = telemetry.filter(
    (sample) => sample.timeMs >= clickTimeMs - APPROACH_WINDOW_MS && sample.timeMs <= clickTimeMs - RECENT_DEAD_ZONE_MS,
  );
  const first = approach[0];
  if (!first) return null;
  const originSamples = approach.filter((sample) => sample.timeMs <= first.timeMs + ORIGIN_SAMPLE_WINDOW_MS);
  const origin = originSamples.reduce(
    (sum, sample) => ({ x: sum.x + sample.cx, y: sum.y + sample.cy, timeMs: sum.timeMs + sample.timeMs }),
    { x: 0, y: 0, timeMs: 0 },
  );
  const count = originSamples.length;
  const originX = origin.x / count;
  const originY = origin.y / count;
  const originTimeMs = origin.timeMs / count;
  const dx = focus.cx - originX;
  const dy = focus.cy - originY;
  const distance = Math.hypot(dx, dy);
  if (distance < MIN_APPROACH_DISTANCE) return null;
  const elapsedSeconds = Math.max(0.08, (clickTimeMs - originTimeMs) / 1_000);
  const speed = distance / elapsedSeconds;
  const distanceScore = smoothstep((distance - MIN_APPROACH_DISTANCE) / 0.42);
  const speedScore = smoothstep((speed - 0.08) / 1.1);
  return {
    intensity: Math.min(0.32, 0.12 + 0.2 * (distanceScore * 0.7 + speedScore * 0.3)),
    horizontal: -dx / distance,
    vertical: -dy / distance,
  };
}
