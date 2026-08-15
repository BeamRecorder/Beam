import { describe, expect, it } from 'vitest';
import { createCompositionCameraEvaluator, type CameraSample } from './composition-camera';
import type { ZoomElement } from './zoom-types';

const zooms: ZoomElement[] = [
  {
    id: 'zoom',
    sessionId: 'session',
    startMs: 200,
    endMs: 1_800,
    focus: { cx: 0.8, cy: 0.25 },
    depth: 3,
    mode: 'manual',
  },
];

const expectSampleClose = (actual: CameraSample, expected: CameraSample) => {
  expect(actual.scale).toBeCloseTo(expected.scale, 8);
  expect(actual.focus.cx).toBeCloseTo(expected.focus.cx, 8);
  expect(actual.focus.cy).toBeCloseTo(expected.focus.cy, 8);
};

describe('composition camera evaluator', () => {
  it('returns the same sample for sequential playback, direct seek, backward seek and export frame rates', () => {
    const sequential = createCompositionCameraEvaluator({ zooms, telemetry: [] });
    for (let time = 0; time <= 1_250; time += 1_000 / 60) sequential.sample(time);
    const expected = sequential.sample(1_250);

    expectSampleClose(createCompositionCameraEvaluator({ zooms, telemetry: [] }).sample(1_250), expected);

    const backward = createCompositionCameraEvaluator({ zooms, telemetry: [] });
    backward.sample(1_700);
    expectSampleClose(backward.sample(1_250), expected);

    for (const fps of [30, 60]) {
      const exported = createCompositionCameraEvaluator({ zooms, telemetry: [] });
      for (let frame = 0; frame <= Math.round(1.25 * fps); frame += 1) exported.sample((frame / fps) * 1_000);
      expectSampleClose(exported.sample(1_250), expected);
    }
  });

  it('rebuilds deterministic checkpoints when invalidated', () => {
    const evaluator = createCompositionCameraEvaluator({ zooms, telemetry: [] });
    const before = evaluator.sample(1_375);
    evaluator.invalidate();
    expectSampleClose(evaluator.sample(1_375), before);
  });
});
