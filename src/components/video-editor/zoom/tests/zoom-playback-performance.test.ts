import { describe, expect, it } from 'vitest';
import type { CursorTelemetryPoint } from '../../../../api/types/capture-session';
import { createZoomTimeEvaluator, smoothedCursorFocusAt, zoomAtTime } from '../zoom-playback';
import type { ZoomElement } from '../zoom-types';

const HISTORY_MS = 600;
const SMOOTHING_MS = 180;

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
  return { cx: previous.cx + (next.cx - previous.cx) * t, cy: previous.cy + (next.cy - previous.cy) * t };
}

/** Keeps the previous full reverse scan as a test oracle for the optimized lookup. */
function referenceSmoothedCursorFocusAt(samples: readonly CursorTelemetryPoint[], timeMs: number) {
  const current = referenceCursorFocusAt(samples, timeMs);
  if (!current) return null;
  let totalWeight = 1;
  let weightedX = current.cx;
  let weightedY = current.cy;
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const sample = samples[index]!;
    if (sample.timeMs >= timeMs) continue;
    const ageMs = timeMs - sample.timeMs;
    if (ageMs > HISTORY_MS) break;
    const weight = Math.exp(-ageMs / SMOOTHING_MS);
    totalWeight += weight;
    weightedX += sample.cx * weight;
    weightedY += sample.cy * weight;
  }
  return { cx: weightedX / totalWeight, cy: weightedY / totalWeight };
}

const telemetry: CursorTelemetryPoint[] = [
  { timeMs: 0, cx: 0.25, cy: 0.3 },
  { timeMs: 100, cx: 0.8, cy: 0.2 },
  { timeMs: 100, cx: 0.7, cy: 0.25 },
  { timeMs: 399, cx: 0.35, cy: 0.65 },
  { timeMs: 400, cx: 0.4, cy: 0.8 },
  { timeMs: 599, cx: 0.6, cy: 0.55 },
  { timeMs: 1_000, cx: 0.52, cy: 0.48 },
];

describe('zoom playback telemetry performance contract', () => {
  it('matches the prior smoothing result around duplicate timestamps and history boundaries', () => {
    const queryTimes = [
      -50, 0, 1, 99, 100, 101, 250, 399, 400, 599, 600, 999, 1_000, 1_001, 1_599, 1_600, 1_601, 2_000,
    ];

    for (const timeMs of queryTimes) {
      expect(smoothedCursorFocusAt(telemetry, timeMs)).toEqual(referenceSmoothedCursorFocusAt(telemetry, timeMs));
    }
  });

  it('bounds point reads near the query when the timeline has a large future tail', () => {
    let timeReads = 0;
    const samples: CursorTelemetryPoint[] = Array.from({ length: 20_001 }, (_, timeMs) => ({
      get timeMs() {
        timeReads += 1;
        return timeMs;
      },
      cx: 0.5,
      cy: 0.5,
    }));

    expect(smoothedCursorFocusAt(samples, 10_000)).toEqual({ cx: 0.5, cy: 0.5 });
    expect(timeReads).toBeLessThan(1_000);
  });

  it('keeps evaluator results stable after snapshot creation and supports forward and backward queries', () => {
    const source = [
      { timeMs: 8_000, cx: 0.55, cy: 0.48, interactionType: 'move' as const, cursorType: 'arrow' },
      { timeMs: 2_000, cx: 0.42, cy: 0.58, interactionType: 'move' as const, cursorType: 'arrow' },
      { timeMs: 4_000, cx: 0.49, cy: 0.53, interactionType: 'move' as const, cursorType: 'arrow' },
      { timeMs: 4_000, cx: 0.51, cy: 0.51, interactionType: 'move' as const, cursorType: 'arrow' },
      { timeMs: 6_000, cx: 0.57, cy: 0.46, interactionType: 'move' as const, cursorType: 'arrow' },
    ];
    const expectedSnapshot = source
      .map(({ timeMs, cx, cy }) => ({ timeMs, cx, cy }))
      .sort((a, b) => a.timeMs - b.timeMs);
    const evaluator = createZoomTimeEvaluator([autoZoom], source);
    const queryTimes = [2_500, 4_000, 4_500, 6_000, 7_000, 8_500];
    const expected = new Map(queryTimes.map((timeMs) => [timeMs, zoomAtTime([autoZoom], timeMs, expectedSnapshot)]));

    source[0]!.timeMs = 1_500;
    source[0]!.cx = 0.1;
    source[1]!.cy = 0.9;

    for (const timeMs of [...queryTimes, ...[...queryTimes].reverse()]) {
      expect(evaluator(timeMs)).toEqual(expected.get(timeMs));
    }
  });

  it('does not revisit reactive telemetry proxies during evaluator queries', () => {
    const reads = { timeMs: 0, cx: 0, cy: 0 };
    const trackedTelemetry = telemetry.map(
      (point) =>
        new Proxy(point, {
          get(target, key, receiver) {
            if (key === 'timeMs' || key === 'cx' || key === 'cy') reads[key] += 1;
            return Reflect.get(target, key, receiver);
          },
        }),
    );
    const evaluator = createZoomTimeEvaluator([autoZoom], trackedTelemetry);
    const readsAfterSnapshot = { ...reads };

    for (const timeMs of [2_000, 4_000, 8_000, 5_000, 1_000]) evaluator(timeMs);

    expect(reads).toEqual(readsAfterSnapshot);
  });
});
