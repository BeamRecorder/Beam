import { expect, it } from 'vitest';
import { createDeterministicCursorMotionEvaluator, stepSpringAxis } from './cursor-motion-evaluator';
import { createDefaultCursorMotionSettings } from '../capture/cursor-settings';
const inputs = (smoothing = 1) => ({
  settings: { ...createDefaultCursorMotionSettings(), smoothing },
  targetAt: (_t: number) => null as { x: number; y: number } | null,
  directTargetAt: (_t: number) => null as { x: number; y: number } | null,
  isDraggingAt: (_t: number) => false,
  buttonTimes: [] as number[],
  stopSpringAt: (_t: number) => ({ x: 0, y: 0, active: false }),
});
it.each([0, 1])('handles empty telemetry, invalid times and reset at smoothing %s', (smoothing) => {
  const evaluator = createDeterministicCursorMotionEvaluator(inputs(smoothing));
  for (const t of [NaN, Infinity, -1, 0, 0.004, 0.5, 1.01])
    expect(evaluator.sample(t)).toMatchObject({ x: 0, y: 0, previousX: 0, previousY: 0 });
  evaluator.reset();
  expect(evaluator.sample(0.5).x).toBe(0);
});
it.each([0, 3 / 7, 1])('keeps under-, critically- and over-damped springs finite at smoothing %s', (smoothing) => {
  const settings = { ...createDefaultCursorMotionSettings(), smoothing };
  const start = { position: 0.1, velocity: 0 };
  expect(stepSpringAxis(start, 0.9, 0, settings)).toBe(start);
  expect(stepSpringAxis(start, 0.9, -100, settings)).toBe(start);
  expect(stepSpringAxis(start, 0.9, 100, settings)).toEqual(stepSpringAxis(start, 0.9, 0.1, settings));
  let state = start;
  for (let i = 0; i < 2000; i++) state = stepSpringAxis(state, 0.9, 1 / 120, settings);
  expect(state.position).toBeCloseTo(0.9, 10);
  expect(Math.abs(state.velocity)).toBeLessThan(1e-8);
  expect(stepSpringAxis({ position: 1, velocity: 1000 }, 1, 0.1, settings)).toEqual({ position: 1, velocity: 0 });
});
it('uses available target samples when direct drag or reappearance telemetry is missing', () => {
  const base = inputs(),
    target = { x: 0.6, y: 0.3 };
  const dragged = createDeterministicCursorMotionEvaluator({
    ...base,
    targetAt: () => target,
    isDraggingAt: () => true,
  });
  expect(dragged.sample(0.403)).toMatchObject(target);
  for (const point of [target, null]) {
    const evaluator = createDeterministicCursorMotionEvaluator({
      ...base,
      targetAt: () => point,
      visibleSinceAt: (t) => (t >= 0.403 ? 0.403 : null),
    });
    expect(evaluator.sample(0.404)).toMatchObject(point ?? { x: 0, y: 0 });
    expect(evaluator.sample(0.41)).toMatchObject(point ?? { x: 0, y: 0 });
  }
});
it('uses raw hover positions and suppresses settling while preserving reverse-seek determinism', () => {
  const base = inputs(),
    raw = { x: 0.75, y: 0.25 };
  const evaluator = createDeterministicCursorMotionEvaluator({
    ...base,
    targetAt: () => ({ x: 0.1, y: 0.9 }),
    directTargetAt: () => raw,
    stopSpringAt: () => ({ x: 0.1, y: 0, active: true }),
    hoverSync: { version: 1, ranges: [{ startSeconds: 0.2, endSeconds: 0.8 }] },
  });
  const expected = evaluator.sample(0.5);
  expect(expected).toMatchObject({ ...raw, stopSpringActive: false });
  evaluator.sample(5);
  expect(evaluator.sample(0.5)).toEqual(expected);
  const missing = createDeterministicCursorMotionEvaluator({
    ...base,
    hoverSync: { version: 1, ranges: [{ startSeconds: 0.2, endSeconds: 0.8 }] },
  });
  expect(missing.sample(0.5)).toMatchObject({ x: 0, y: 0 });
});
