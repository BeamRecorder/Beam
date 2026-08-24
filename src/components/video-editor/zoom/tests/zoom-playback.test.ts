import { describe, expect, it } from 'vitest';
import {
  clampFocusToScale,
  createZoomTimeEvaluator,
  cursorFocusAt,
  regionStrength,
  smoothedCursorFocusAt,
  zoomAtTime,
} from '../zoom-playback';
import type { ZoomElement } from '../zoom-types';

const zoom: ZoomElement = {
  id: 'zoom',
  sessionId: 'session',
  startMs: 2_000,
  endMs: 6_000,
  focus: { cx: 0.3, cy: 0.7 },
  depth: 2,
  mode: 'auto',
};

describe('zoom playback', () => {
  it('returns null outside the envelope', () => expect(zoomAtTime([zoom], 100)).toBeNull());
  it('uses the Depth scale at full strength', () => expect(zoomAtTime([zoom], 4_000)?.scale).toBe(1.5));
  it('defaults legacy zooms to a flat projection', () => expect(zoomAtTime([zoom], 4_000)?.tilt).toBe(0));
  it('applies normalized 3D tilt intensity', () => {
    const threeD = { ...zoom, projection: '3d' as const, tiltIntensity: 2 };

    expect(zoomAtTime([threeD], 4_000)?.tilt).toBe(1);
  });
  it('preserves signed horizontal and vertical tilt axes', () => {
    const threeD: ZoomElement = {
      ...zoom,
      projection: '3d',
      tiltIntensity: 1,
      tiltHorizontal: -1,
      tiltVertical: 1,
    };

    expect(zoomAtTime([threeD], 4_000)).toMatchObject({ tiltHorizontal: -1, tiltVertical: 1 });
  });
  it('clamps camera focus to visible bounds', () =>
    expect(clampFocusToScale({ cx: 0, cy: 1 }, 2)).toEqual({
      cx: 0.25,
      cy: 0.75,
    }));
  it('tracks the telemetry focus for automatic regions', () =>
    expect(zoomAtTime([zoom], 4_000, [{ timeMs: 4_000, cx: 0.8, cy: 0.2 }])?.focus).toEqual({
      cx: 0.6666666666666667,
      cy: 0.3333333333333333,
    }));
  it('smooths an abrupt cursor jump using recent telemetry', () => {
    const focus = smoothedCursorFocusAt(
      [
        { timeMs: 0, cx: 0.2, cy: 0.5 },
        { timeMs: 100, cx: 0.8, cy: 0.5 },
      ],
      100,
    );
    expect(focus?.cx).toBeGreaterThan(0.2);
    expect(focus?.cx).toBeLessThan(0.8);
    expect(focus?.cy).toBe(0.5);
  });
  it('interpolates telemetry before, between, and after samples', () => {
    const telemetry = [
      { timeMs: 1_000, cx: 0.1, cy: 0.2 },
      { timeMs: 2_000, cx: 0.5, cy: 0.6 },
      { timeMs: 3_000, cx: 0.9, cy: 0.4 },
    ];

    expect(cursorFocusAt(telemetry, 500)).toEqual({ cx: 0.1, cy: 0.2 });
    expect(cursorFocusAt(telemetry, 1_500)?.cx).toBeCloseTo(0.3, 12);
    expect(cursorFocusAt(telemetry, 1_500)?.cy).toBeCloseTo(0.4, 12);
    expect(cursorFocusAt(telemetry, 4_000)).toEqual({ cx: 0.9, cy: 0.4 });
  });
  it('sorts zooms and telemetry once when building an evaluator', () => {
    const next: ZoomElement = {
      ...zoom,
      id: 'next',
      startMs: 6_800,
      endMs: 10_000,
      focus: { cx: 0.7, cy: 0.3 },
      depth: 4,
    };
    const autoZoom: ZoomElement = {
      ...zoom,
      id: 'auto',
      startMs: 0,
      endMs: 10_000,
      mode: 'auto',
    };
    const telemetry = [
      { timeMs: 3_000, cx: 0.9, cy: 0.4 },
      { timeMs: 1_000, cx: 0.1, cy: 0.2 },
      { timeMs: 2_000, cx: 0.5, cy: 0.6 },
    ];
    const evaluator = createZoomTimeEvaluator([next, zoom], []);
    const autoEvaluator = createZoomTimeEvaluator([autoZoom], telemetry);

    for (const timeMs of [0, 1_500, 4_000, 6_700, 7_500, 10_500]) {
      expect(evaluator(timeMs)).toEqual(zoomAtTime([zoom, next], timeMs));
    }
    for (const timeMs of [500, 1_500, 2_500, 4_000, 9_000, 11_000]) {
      expect(autoEvaluator(timeMs)).toEqual(
        zoomAtTime(
          [autoZoom],
          timeMs,
          [...telemetry].sort((a, b) => a.timeMs - b.timeMs),
        ),
      );
    }
  });
  it('returns the same values as zoomAtTime for a complete time sequence', () => {
    const next: ZoomElement = {
      ...zoom,
      id: 'next',
      startMs: 6_800,
      endMs: 10_000,
      focus: { cx: 0.7, cy: 0.3 },
      depth: 4,
    };
    const telemetry = [
      { timeMs: 1_000, cx: 0.1, cy: 0.2 },
      { timeMs: 2_000, cx: 0.5, cy: 0.6 },
      { timeMs: 3_000, cx: 0.9, cy: 0.4 },
    ];
    const evaluator = createZoomTimeEvaluator([next, zoom], telemetry);

    for (let timeMs = 0; timeMs <= 11_000; timeMs += 125) {
      expect(evaluator(timeMs)).toEqual(zoomAtTime([next, zoom], timeMs, telemetry));
    }
  });
  it('connects neighboring regions with an interpolated pan', () => {
    const next: ZoomElement = {
      ...zoom,
      id: 'next',
      startMs: 6_800,
      endMs: 10_000,
      focus: { cx: 0.7, cy: 0.3 },
      depth: 4,
    };
    const result = zoomAtTime([zoom, next], 6_700);
    expect(result?.scale).toBeGreaterThan(1.5);
    expect(result?.scale).toBeLessThan(2.2);
  });
  it('interpolates tilt across a 2D-to-3D connected transition', () => {
    const next: ZoomElement = {
      ...zoom,
      id: 'three-d-next',
      startMs: 6_800,
      endMs: 10_000,
      focus: { cx: 0.7, cy: 0.3 },
      depth: 4,
      projection: '3d',
      tiltIntensity: 0.8,
    };
    const result = zoomAtTime([zoom, next], 6_700);

    expect(result?.tilt).toBeCloseTo(0.8 * (1 - 0.5 ** 3), 12);
    expect(result?.tilt).toBeGreaterThan(0);
    expect(result?.tilt).toBeLessThan(0.8);
  });
  it('interpolates signed tilt axes between connected zooms', () => {
    const first: ZoomElement = {
      ...zoom,
      projection: '3d',
      tiltHorizontal: -1,
      tiltVertical: -1,
    };
    const next: ZoomElement = {
      ...zoom,
      id: 'axis-next',
      startMs: 6_800,
      endMs: 10_000,
      focus: { cx: 0.7, cy: 0.3 },
      depth: 4,
      projection: '3d',
      tiltHorizontal: 1,
      tiltVertical: 1,
    };
    const result = zoomAtTime([first, next], 6_700);

    expect(result?.tiltHorizontal).toBeCloseTo(0.75, 12);
    expect(result?.tiltVertical).toBeCloseTo(0.75, 12);
  });
  it('keeps manual mode when connected manual regions pan into each other', () => {
    const next: ZoomElement = {
      ...zoom,
      id: 'manual-next',
      startMs: 6_800,
      endMs: 10_000,
      focus: { cx: 0.7, cy: 0.3 },
      depth: 4,
      mode: 'manual',
    };
    const result = zoomAtTime([{ ...zoom, mode: 'manual' }, next], 6_700);

    expect(result?.mode).toBe('manual');
  });
  it('uses zero strength before an incoming region', () => expect(regionStrength(zoom, 0)).toBe(0));
});
