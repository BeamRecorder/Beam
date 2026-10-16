import { describe, expect, it } from 'vitest';
import { buildAutomaticZoomElements } from '../zoom-suggestions';
import { cinematicZoomDurationMs } from '../zoom-transitions';
import { zoomAtTime } from '../zoom-playback';
import { createCompositionCameraEvaluator } from '../composition-camera';
import { ZOOM_DEPTH_SCALES } from '../zoom-types';
import type { CursorTelemetryPoint } from '../../capture/capture-session';

const click = (timeMs: number, cx = 0.5, cy = 0.5): CursorTelemetryPoint => ({
  timeMs,
  cx,
  cy,
  interactionType: 'click',
});
const plan = (telemetry: CursorTelemetryPoint[], durationMs: number) =>
  buildAutomaticZoomElements({ telemetry, durationMs, sessionId: 'take' });

describe('automatic shot density', () => {
  it.each([30_000, 60_000, 180_000])('breaks a continuous chain of clicks into readable shots: %d ms', (duration) => {
    const zooms = plan(
      Array.from({ length: duration / 1000 }, (_, index) => click(index * 1000)),
      duration,
    );
    expect(zooms.length).toBeGreaterThan(1);
    expect(zooms.reduce((sum, zoom) => sum + zoom.endMs - zoom.startMs, 0)).toBeLessThan(duration * 0.8);
    for (const zoom of zooms) expect(zoom.endMs - zoom.startMs).toBeLessThan(10_000);
    for (let index = 1; index < zooms.length; index++) {
      const before = zooms[index - 1]!,
        after = zooms[index]!;
      const from = before.endMs + cinematicZoomDurationMs(ZOOM_DEPTH_SCALES[before.depth]);
      const to = after.startMs - cinematicZoomDurationMs(ZOOM_DEPTH_SCALES[after.depth]);
      expect(to - from).toBeGreaterThanOrEqual(1500);
      expect(zoomAtTime(zooms, (from + to) / 2)).toBeNull();
    }
  });
  it('holds an uninterrupted long drag without splitting it into artificial pauses', () => {
    const telemetry: CursorTelemetryPoint[] = [
      click(5000, 0.05, 0.1),
      { ...click(40000, 0.95, 0.9), interactionType: 'move' },
      { ...click(75000, 0.2, 0.3), interactionType: 'mouseup' },
    ];
    const zooms = plan(telemetry, 90000),
      camera = createCompositionCameraEvaluator({ zooms, telemetry });
    expect(zooms).toHaveLength(1);
    expect(zooms[0]!.depth).toBe(1);
    for (const time of [5000, 20000, 40000, 60000, 75000]) expect(camera.sample(time).scale).toBeCloseTo(1.25, 8);
  });
  it('does not extend a long drag indefinitely by merging later clicks', () => {
    const telemetry: CursorTelemetryPoint[] = [
      click(1000),
      { ...click(16000), interactionType: 'mouseup' },
      ...Array.from({ length: 30 }, (_, index) => click(18000 + index * 1000)),
    ];
    const zooms = plan(telemetry, 50000);
    expect(zooms.length).toBeGreaterThan(1);
    expect(zooms[0]!.endMs).toBe(17500);
    expect(zooms.at(-1)!.endMs).toBeGreaterThan(40000);
  });
  it('keeps finite, separated, bounded shots across dense and shuffled hostile traces', () => {
    let seed = 7541;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    for (let trace = 0; trace < 40; trace++) {
      const telemetry = Array.from({ length: 250 }, () => click(random() * 60000, random(), random()));
      telemetry.push(click(NaN), click(Infinity), { ...click(123), cx: NaN });
      const before = structuredClone(telemetry),
        zooms = plan(telemetry, 60000);
      expect(telemetry).toEqual(before);
      expect(new Set(zooms.map((zoom) => zoom.id)).size).toBe(zooms.length);
      for (const [index, zoom] of zooms.entries()) {
        expect(zoom.startMs).toBeGreaterThanOrEqual(0);
        expect(zoom.endMs - zoom.startMs).toBeGreaterThanOrEqual(1800);
        expect(zoom.endMs).toBeLessThan(59000);
        expect([zoom.focus.cx, zoom.focus.cy, zoom.startMs, zoom.endMs].every(Number.isFinite)).toBe(true);
        if (index) {
          const previous = zooms[index - 1]!;
          expect(
            zoom.startMs -
              previous.endMs -
              cinematicZoomDurationMs(ZOOM_DEPTH_SCALES[zoom.depth]) -
              cinematicZoomDurationMs(ZOOM_DEPTH_SCALES[previous.depth]),
          ).toBeGreaterThanOrEqual(1500);
        }
      }
    }
  });
});
