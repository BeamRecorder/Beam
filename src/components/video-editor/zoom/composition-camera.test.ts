import { describe, expect, it } from 'vitest';
import {
  cameraTiltForControls,
  createCompositionCameraEvaluator,
  MAX_CAMERA_TILT_RADIANS,
  type CameraSample,
} from './composition-camera';
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

const autoZoom: ZoomElement = {
  id: 'auto-follow',
  sessionId: 'session',
  startMs: 0,
  endMs: 5_000,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 2,
  mode: 'auto',
};

const autoFollow = { safeZone: 0.5, responsiveness: 0.55, directionLock: true } as const;

describe('composition camera evaluator', () => {
  it('keeps an auto zoom stable while the cursor remains inside its safe zone', () => {
    const evaluator = createCompositionCameraEvaluator({
      zooms: [autoZoom],
      telemetry: [
        { timeMs: 0, cx: 0.58, cy: 0.42 },
        { timeMs: 5_000, cx: 0.58, cy: 0.42 },
      ],
      autoFollow,
    });

    expect(evaluator.sample(2_500).focus).toEqual({ cx: 0.5, cy: 0.5 });
  });

  it('corrects the minimum required axes when an auto-zoom cursor leaves the safe zone', () => {
    const evaluator = createCompositionCameraEvaluator({
      zooms: [autoZoom],
      telemetry: [
        { timeMs: 0, cx: 0.9, cy: 0.5 },
        { timeMs: 5_000, cx: 0.9, cy: 0.5 },
      ],
      autoFollow,
    });

    const sample = evaluator.sample(2_500);
    expect(sample.focus.cx).toBeGreaterThan(0.5);
    expect(sample.focus.cy).toBe(0.5);
  });

  it('returns deterministic samples for sequential, direct and non-sequential access', () => {
    const create = () =>
      createCompositionCameraEvaluator({
        zooms: [autoZoom],
        telemetry: [
          { timeMs: 0, cx: 0.9, cy: 0.5 },
          { timeMs: 1_000, cx: 0.9, cy: 0.5 },
          { timeMs: 2_000, cx: 0.5, cy: 0.9 },
          { timeMs: 5_000, cx: 0.5, cy: 0.9 },
        ],
        autoFollow,
      });
    const expected = create().sample(2_500);
    const sequential = create();
    for (let timeMs = 0; timeMs <= 2_500; timeMs += 1000 / 60) sequential.sample(timeMs);
    expectSampleClose(sequential.sample(2_500), expected);

    const nonSequential = create();
    nonSequential.sample(4_000);
    nonSequential.sample(750);
    expectSampleClose(nonSequential.sample(2_500), expected);
  });

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

  it('keeps legacy zooms flat when projection fields are missing', () => {
    const sample = createCompositionCameraEvaluator({ zooms, telemetry: [] }).sample(1_000);

    expect(sample.tiltX).toBe(0);
    expect(sample.tiltY).toBe(0);
  });

  it('interpolates finite tilt for a 3D zoom', () => {
    const sample = createCompositionCameraEvaluator({
      zooms: [{ ...zooms[0]!, projection: '3d', tiltIntensity: 1 }],
      telemetry: [],
    }).sample(1_000);

    expect(Number.isFinite(sample.tiltX)).toBe(true);
    expect(Number.isFinite(sample.tiltY)).toBe(true);
    expect(Math.abs(sample.tiltX ?? 0)).toBeLessThanOrEqual(MAX_CAMERA_TILT_RADIANS);
    expect(Math.abs(sample.tiltY ?? 0)).toBeLessThanOrEqual(MAX_CAMERA_TILT_RADIANS);
  });

  it.each([
    ['left', -1, 0, 0, -MAX_CAMERA_TILT_RADIANS],
    ['right', 1, 0, 0, MAX_CAMERA_TILT_RADIANS],
    ['up', 0, -1, -MAX_CAMERA_TILT_RADIANS, 0],
    ['down', 0, 1, MAX_CAMERA_TILT_RADIANS, 0],
    ['left/up diagonal', -1, -1, -MAX_CAMERA_TILT_RADIANS / Math.SQRT2, -MAX_CAMERA_TILT_RADIANS / Math.SQRT2],
    ['right/down diagonal', 1, 1, MAX_CAMERA_TILT_RADIANS / Math.SQRT2, MAX_CAMERA_TILT_RADIANS / Math.SQRT2],
  ])(
    'maps %s controls to signed tilt axes at the 62° maximum',
    (_label, horizontal, vertical, expectedX, expectedY) => {
      const result = cameraTiltForControls(1, horizontal, vertical);

      expect(result.tiltX).toBeCloseTo(expectedX, 12);
      expect(result.tiltY).toBeCloseTo(expectedY, 12);
    },
  );

  it('clamps intensity and both signed axes before applying the 62° maximum', () => {
    const horizontal = cameraTiltForControls(4, -3, 0);
    const vertical = cameraTiltForControls(4, 0, 2);

    expect(horizontal.tiltX).toBe(0);
    expect(horizontal.tiltY).toBeCloseTo(-MAX_CAMERA_TILT_RADIANS, 12);
    expect(vertical.tiltX).toBeCloseTo(MAX_CAMERA_TILT_RADIANS, 12);
    expect(vertical.tiltY).toBe(0);
    expect(Math.abs(horizontal.tiltY)).toBeLessThanOrEqual(MAX_CAMERA_TILT_RADIANS);
    expect(Math.abs(vertical.tiltX)).toBeLessThanOrEqual(MAX_CAMERA_TILT_RADIANS);
  });

  it('keeps tilt deterministic when sampled through 30 and 60 fps playback', () => {
    const threeDZoom: ZoomElement = {
      ...zooms[0]!,
      projection: '3d',
      tiltIntensity: 1,
      tiltHorizontal: 0.9,
      tiltVertical: -0.8,
    };
    const reference = createCompositionCameraEvaluator({ zooms: [threeDZoom], telemetry: [] });
    const expected = reference.sample(1_250);

    for (const fps of [30, 60]) {
      const evaluator = createCompositionCameraEvaluator({ zooms: [threeDZoom], telemetry: [] });
      for (let frame = 0; frame <= Math.round((1_250 / 1_000) * fps); frame += 1)
        evaluator.sample((frame / fps) * 1_000);
      const actual = evaluator.sample(1_250);

      expect(actual.tiltX ?? 0).toBeCloseTo(expected.tiltX ?? 0, 8);
      expect(actual.tiltY ?? 0).toBeCloseTo(expected.tiltY ?? 0, 8);
    }
  });
});
