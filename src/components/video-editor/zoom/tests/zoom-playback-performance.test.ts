import { describe, expect, it } from 'vitest';
import type { CursorTelemetryPoint } from '../../../../api/types/capture-session';
import { createZoomTimeEvaluator, cursorFocusAt, zoomAtTime } from '../zoom-playback';
import type { ZoomElement } from '../zoom-types';

const autoZoom: ZoomElement = {
  id: 'auto-zoom',
  sessionId: 'session',
  startMs: 0,
  endMs: 20_000,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 2,
  mode: 'auto',
};

function referenceCursorFocusAt(samples: readonly CursorTelemetryPoint[], timeMs: number) {
  let previous: CursorTelemetryPoint | undefined;
  let next: CursorTelemetryPoint | undefined;
  for (const sample of samples) {
    if (sample.timeMs <= timeMs) previous = sample;
    else {
      next = sample;
      break;
    }
  }
  if (!previous) return next ? { cx: next.cx, cy: next.cy } : null;
  if (!next) return { cx: previous.cx, cy: previous.cy };
  const progress = (timeMs - previous.timeMs) / Math.max(1, next.timeMs - previous.timeMs);
  return {
    cx: previous.cx + (next.cx - previous.cx) * progress,
    cy: previous.cy + (next.cy - previous.cy) * progress,
  };
}

describe('zoom playback performance contract', () => {
  it('matches cursor interpolation at boundaries and across duplicate timestamps', () => {
    const telemetry: CursorTelemetryPoint[] = [
      { timeMs: 0, cx: 0.25, cy: 0.3 },
      { timeMs: 100, cx: 0.8, cy: 0.2 },
      { timeMs: 100, cx: 0.7, cy: 0.25 },
      { timeMs: 300, cx: 0.35, cy: 0.65 },
      { timeMs: 300, cx: 0.4, cy: 0.8 },
      { timeMs: 700, cx: 0.6, cy: 0.55 },
    ];
    const queryTimes = [-50, 0, 99, 100, 101, 200, 299, 300, 301, 699, 700, 1_000];

    for (const timeMs of queryTimes) {
      expect(cursorFocusAt(telemetry, timeMs)).toEqual(referenceCursorFocusAt(telemetry, timeMs));
    }
    expect(cursorFocusAt([], 100)).toBeNull();
    expect(cursorFocusAt(telemetry, 100)).toEqual({ cx: 0.7, cy: 0.25 });
  });

  it('bounds telemetry reads logarithmically when a query has a large future tail', () => {
    let timeReads = 0;
    const samples: CursorTelemetryPoint[] = Array.from({ length: 32_769 }, (_, timeMs) => ({
      get timeMs() {
        timeReads += 1;
        return timeMs;
      },
      cx: 0.5,
      cy: 0.5,
    }));

    expect(cursorFocusAt(samples, 16_000)).toEqual({ cx: 0.5, cy: 0.5 });
    expect(timeReads).toBeLessThan(64);
  });

  it('filters disabled zooms and stays deterministic across forward and backward queries', () => {
    const active: ZoomElement = { ...autoZoom, startMs: 2_000, endMs: 6_000 };
    const disabled: ZoomElement = {
      ...autoZoom,
      id: 'disabled-zoom',
      startMs: 0,
      endMs: 20_000,
      depth: 6,
      enabled: false,
    };
    const zooms = [active, disabled];
    const originalOrder = zooms.map((zoom) => zoom.id);
    const evaluator = createZoomTimeEvaluator(zooms);
    const disabledOnly = createZoomTimeEvaluator([disabled]);
    const times = [0, 1_500, 2_700, 4_000, 6_500, 7_000];
    const forward = new Map(times.map((timeMs) => [timeMs, evaluator(timeMs)]));

    expect(disabledOnly(4_000)).toBeNull();
    expect(forward.get(0)).toBeNull();
    expect(forward.get(4_000)).toEqual(zoomAtTime([active], 4_000));
    for (const timeMs of [...times].reverse()) expect(evaluator(timeMs)).toEqual(forward.get(timeMs));
    expect(zooms.map((zoom) => zoom.id)).toEqual(originalOrder);
  });
});
