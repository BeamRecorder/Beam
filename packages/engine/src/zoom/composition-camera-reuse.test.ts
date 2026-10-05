import { describe, expect, it, vi } from 'vitest';
import { createCompositionCameraEvaluator, cameraTiltForControls } from './composition-camera';
import type { CompositionCameraInputs } from './composition-camera-types';
import { cameraEditInvalidationTime } from './camera-edit-invalidation';
import { emptyComposition } from '../shared/composition-types';
import type { ZoomElement } from './zoom-types';

const zoom: ZoomElement = {
  id: 'auto',
  sessionId: 's',
  startMs: 0,
  endMs: 5_000,
  mode: 'auto',
  depth: 2,
  focus: { cx: 0.5, cy: 0.5 },
};
const inputs = (): CompositionCameraInputs => ({
  zooms: [zoom],
  telemetry: [
    { timeMs: 0, cx: 0.9, cy: 0.5 },
    { timeMs: 2_000, cx: 0.5, cy: 0.9 },
    { timeMs: 5_000, cx: 0.1, cy: 0.5 },
  ],
});

describe('camera checkpoint reuse', () => {
  it('keeps malformed times and tilt controls finite and tolerates absent telemetry', () => {
    const evaluator = createCompositionCameraEvaluator({ zooms: [zoom], telemetry: [] });
    expect(evaluator.sample(Number.NaN)).toEqual(evaluator.sample(0));
    expect(evaluator.sample(Infinity)).toEqual(evaluator.sample(0));
    expect(evaluator.sample(-100)).toEqual(evaluator.sample(0));
    expect(cameraTiltForControls(Number.NaN, Infinity, Number.NaN)).toEqual({ tiltX: 0, tiltY: 0 });
    expect(evaluator.sample(3_333.3).scale).toBeGreaterThan(1);
  });
  it('keeps unchanged history for forward, backward and fractional samples', () => {
    const value = inputs(),
      previous = createCompositionCameraEvaluator(value);
    previous.sample(4_000);
    const mapTelemetryTime = vi.fn((time: number) => time);
    const next = createCompositionCameraEvaluator(
      { ...value, mapTelemetryTime },
      { previous, unchangedBeforeMs: Infinity },
    );
    for (const time of [4_000, 2_125.5, 4_200, 250, 0]) {
      expect(next.sample(time)).toEqual(createCompositionCameraEvaluator(value).sample(time));
    }
    expect(mapTelemetryTime.mock.calls.length).toBeLessThan(150);
  });

  it('discards a checkpoint exactly at the first changed simulation step', () => {
    const value = inputs(),
      previous = createCompositionCameraEvaluator(value);
    previous.sample(1_000);
    const mapTelemetryTime = vi.fn((time: number) => (time >= 250 ? 0 : time));
    const updated = { ...value, mapTelemetryTime };
    const next = createCompositionCameraEvaluator(updated, { previous, unchangedBeforeMs: 250 });
    const actual = next.sample(2_500);
    expect(mapTelemetryTime.mock.calls.some(([time]) => Math.abs(time - 250) < 1e-6)).toBe(true);
    expect(actual).toEqual(createCompositionCameraEvaluator(updated).sample(2_500));
    expect(actual).not.toEqual(previous.sample(2_500));
  });

  it('recalculates connected pans before a moved zoom and matches a cold export evaluator', () => {
    const first = { ...zoom, id: 'first', mode: 'manual' as const, endMs: 3_000 };
    const second = { ...first, id: 'second', startMs: 4_250, endMs: 7_000, focus: { cx: 0.8, cy: 0.8 } };
    const previous = createCompositionCameraEvaluator({ zooms: [first, second], telemetry: [] });
    previous.sample(7_000);
    const updated = { ...second, startMs: 4_000, depth: 3 as const };
    const composition = emptyComposition();
    const changedFrom = cameraEditInvalidationTime(composition, composition, [first, second], [first, updated]);
    const value = { zooms: [first, updated], telemetry: [] };
    const next = createCompositionCameraEvaluator(value, { previous, unchangedBeforeMs: changedFrom });
    const cold = createCompositionCameraEvaluator(value);
    for (const time of [3_200, 3_555.5, 6_000, 2_000, 4_000]) expect(next.sample(time)).toEqual(cold.sample(time));
  });

  it.each([0, -1, Number.NaN])('rebuilds from zero for an invalid or empty reusable range %s', (unchangedBeforeMs) => {
    const value = inputs(),
      previous = createCompositionCameraEvaluator(value);
    previous.sample(1_000);
    const mapTelemetryTime = vi.fn((time: number) => time);
    const next = createCompositionCameraEvaluator({ ...value, mapTelemetryTime }, { previous, unchangedBeforeMs });
    expect(next.sample(1_000)).toEqual(previous.sample(1_000));
    expect(mapTelemetryTime.mock.calls.length).toBeGreaterThan(100);
  });

  it('does not borrow missing history or checkpoints cleared by explicit invalidation', () => {
    const value = inputs(),
      previous = createCompositionCameraEvaluator(value);
    previous.sample(1_000);
    previous.invalidate();
    const mapTelemetryTime = vi.fn((time: number) => time);
    const next = createCompositionCameraEvaluator(
      { ...value, mapTelemetryTime },
      { previous, unchangedBeforeMs: Infinity },
    );
    expect(next.sample(1_000)).toEqual(previous.sample(1_000));
    expect(mapTelemetryTime.mock.calls.length).toBeGreaterThan(100);
    const external = { sample: previous.sample, invalidate: () => {} };
    expect(
      createCompositionCameraEvaluator(value, { previous: external, unchangedBeforeMs: Infinity }).sample(1_000),
    ).toEqual(previous.sample(1_000));
  });
});
