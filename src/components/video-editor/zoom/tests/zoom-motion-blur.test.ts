import { describe, expect, it, vi } from 'vitest';
import type { Canvas2DContext } from '~/types/canvas';
import { createZoomMotionBlurSamplePlan } from '../zoom-motion-blur';
import { compositeIsolatedMotionBlurSample, type MotionBlurSurface } from '../zoom-motion-blur-compositor';

const camera = (focusX: number, focusY: number, scale: number) => ({ focusX, focusY, scale });
type MotionBlurPlanOptions = Parameters<typeof createZoomMotionBlurSamplePlan>[0] & {
  viewportWidth: number;
  viewportHeight: number;
};

const planForPixelMovement = (previousX: number, currentX: number, intensity = 0.55) =>
  createZoomMotionBlurSamplePlan({
    previous: camera(previousX, 0.5, 1),
    current: camera(currentX, 0.5, 1),
    intensity,
    deltaMs: 16,
    viewportWidth: 1_920,
    viewportHeight: 1_080,
  } as MotionBlurPlanOptions);

describe('zoom motion-blur sample plan', () => {
  it('collapses an idle camera or zero intensity to one fully weighted sample', () => {
    const current = camera(0.5, 0.5, 1.5);

    expect(
      createZoomMotionBlurSamplePlan({
        previous: current,
        current,
        intensity: 0.8,
        deltaMs: 16,
      }),
    ).toEqual([{ camera: { ...current, tiltX: 0, tiltY: 0 }, weight: 1 }]);

    expect(
      createZoomMotionBlurSamplePlan({
        previous: camera(0.2, 0.8, 1.1),
        center: camera(0.45, 0.55, 1.4),
        current,
        intensity: 0,
        deltaMs: 16,
      }),
    ).toEqual([{ camera: { ...camera(0.45, 0.55, 1.4), tiltX: 0, tiltY: 0 }, weight: 1 }]);
  });

  it('creates a symmetric moving-camera kernel with normalized weights', () => {
    const samples = createZoomMotionBlurSamplePlan({
      previous: camera(0.2, 0.8, 1.1),
      current: camera(0.8, 0.2, 1.8),
      intensity: 1,
      deltaMs: 16,
      sampleCount: 5,
    });

    expect(samples.length).toBeGreaterThanOrEqual(3);
    expect(samples.length).toBeLessThanOrEqual(5);
    expect(samples.map(({ weight }) => weight)).toEqual([...samples].reverse().map(({ weight }) => weight));
    expect(samples.reduce((total, { weight }) => total + weight, 0)).toBeCloseTo(1, 12);
    expect(samples[0]?.camera).not.toEqual(samples.at(-1)?.camera);
  });

  it('samples tilt-only movement and interpolates both perspective axes', () => {
    const samples = createZoomMotionBlurSamplePlan({
      previous: { ...camera(0.5, 0.5, 1), tiltX: -0.2, tiltY: 0.4 },
      current: { ...camera(0.5, 0.5, 1), tiltX: 0.2, tiltY: -0.4 },
      center: camera(0.5, 0.5, 1),
      intensity: 1,
      deltaMs: 16,
      sampleCount: 3,
    });

    expect(samples).toHaveLength(3);
    expect(samples[0]?.camera.tiltX).toBeCloseTo(-0.2, 12);
    expect(samples[0]?.camera.tiltY).toBeCloseTo(0.4, 12);
    expect(samples[1]?.camera.tiltX).toBeCloseTo(0, 12);
    expect(samples[1]?.camera.tiltY).toBeCloseTo(0, 12);
    expect(samples[2]?.camera.tiltX).toBeCloseTo(0.2, 12);
    expect(samples[2]?.camera.tiltY).toBeCloseTo(-0.4, 12);
  });

  it('keeps visible tilt-only movement above the viewport travel gate', () => {
    const samples = createZoomMotionBlurSamplePlan({
      previous: { ...camera(0.5, 0.5, 1), tiltX: -0.01, tiltY: 0 },
      current: { ...camera(0.5, 0.5, 1), tiltX: 0.01, tiltY: 0 },
      intensity: 1,
      deltaMs: 16,
      viewportWidth: 1_920,
      viewportHeight: 1_080,
    });

    expect(samples).toHaveLength(3);
  });

  it('sanitizes non-finite tilt values in blur samples', () => {
    const samples = createZoomMotionBlurSamplePlan({
      previous: { ...camera(0.5, 0.5, 1), tiltX: Number.POSITIVE_INFINITY, tiltY: Number.NaN },
      current: { ...camera(0.5, 0.5, 1), tiltX: Number.NaN, tiltY: Number.NEGATIVE_INFINITY },
      intensity: 1,
      deltaMs: 16,
      sampleCount: 3,
    });

    expect(
      samples.every(({ camera: sample }) =>
        [sample.focusX, sample.focusY, sample.scale, sample.tiltX, sample.tiltY].every(Number.isFinite),
      ),
    ).toBe(true);
  });

  it.each([
    ['sub-pixel', 0.5002, 1],
    ['medium', 0.502, 3],
    ['strong', 0.6, 5],
  ])('adapts the sample count to %s movement in viewport pixels', (_label, currentX, expectedCount) => {
    const samples = planForPixelMovement(0.5, currentX);

    expect(samples).toHaveLength(expectedCount);
  });

  it('keeps disabled motion blur at one sample even for large pixel movement', () => {
    const samples = planForPixelMovement(0.5, 0.6, 0);

    expect(samples).toEqual([{ camera: { ...camera(0.6, 0.5, 1), tiltX: 0, tiltY: 0 }, weight: 1 }]);
  });

  it('reuses one 2D context when compositing multiple samples into the same surface', () => {
    const sampleContext = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      filter: 'none',
      shadowColor: 'transparent',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    } as unknown as Canvas2DContext;
    const target = {
      globalAlpha: 1,
      save: vi.fn(),
      drawImage: vi.fn(),
      restore: vi.fn(),
    } as unknown as Canvas2DContext;
    const surface = {
      width: 32,
      height: 18,
      getContext: vi.fn(() => sampleContext),
    } as unknown as MotionBlurSurface;
    const draw = vi.fn();
    const sample = { camera: camera(0.5, 0.5, 1), weight: 0.5 };
    const options = {
      target,
      surface,
      logicalWidth: 32,
      logicalHeight: 18,
      pixelScale: 1,
      sample,
      accumulatedWeight: 0,
      draw,
    };

    expect(compositeIsolatedMotionBlurSample(options)).toBe(true);
    expect(compositeIsolatedMotionBlurSample({ ...options, accumulatedWeight: sample.weight })).toBe(true);

    expect(surface.getContext).toHaveBeenCalledOnce();
    expect(draw).toHaveBeenNthCalledWith(1, sampleContext, sample);
    expect(draw).toHaveBeenNthCalledWith(2, sampleContext, sample);
    expect(target.drawImage).toHaveBeenCalledTimes(2);
  });

  it('requests an alpha-enabled context so transparent scene pixels stay transparent', () => {
    const sampleContext = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      filter: 'none',
      shadowColor: 'transparent',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    } as unknown as Canvas2DContext;
    const surface = {
      width: 32,
      height: 18,
      getContext: vi.fn(() => sampleContext),
    } as unknown as MotionBlurSurface;
    const target = {
      globalAlpha: 1,
      save: vi.fn(),
      drawImage: vi.fn(),
      restore: vi.fn(),
    } as unknown as Canvas2DContext;

    compositeIsolatedMotionBlurSample({
      target,
      surface,
      logicalWidth: 32,
      logicalHeight: 18,
      pixelScale: 1,
      sample: { camera: camera(0.5, 0.5, 1), weight: 1 },
      accumulatedWeight: 0,
      draw: vi.fn(),
    });

    expect(surface.getContext).toHaveBeenCalledWith('2d', { alpha: true, desynchronized: true });
  });

  it('clears the alpha surface before drawing every isolated sample', () => {
    const sampleContext = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      filter: 'none',
      shadowColor: 'transparent',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    } as unknown as Canvas2DContext;
    const surface = {
      width: 32,
      height: 18,
      getContext: vi.fn(() => sampleContext),
    } as unknown as MotionBlurSurface;
    const target = {
      globalAlpha: 1,
      save: vi.fn(),
      drawImage: vi.fn(),
      restore: vi.fn(),
    } as unknown as Canvas2DContext;
    const draw = vi.fn();
    const sample = { camera: camera(0.5, 0.5, 1), weight: 0.5 };

    compositeIsolatedMotionBlurSample({
      target,
      surface,
      logicalWidth: 32,
      logicalHeight: 18,
      pixelScale: 1,
      sample,
      accumulatedWeight: 0,
      draw,
    });

    expect(sampleContext.clearRect).toHaveBeenCalledWith(0, 0, 32, 18);
    const clearRect = sampleContext.clearRect as ReturnType<typeof vi.fn>;
    expect(clearRect.mock.invocationCallOrder[0]).toBeLessThan(
      draw.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it('composites a transparent sample with the accumulated source-over alpha', () => {
    const sampleContext = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      filter: 'none',
      shadowColor: 'transparent',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    } as unknown as Canvas2DContext;
    const surface = {
      width: 32,
      height: 18,
      getContext: vi.fn(() => sampleContext),
    } as unknown as MotionBlurSurface;
    const target = {
      globalAlpha: 1,
      save: vi.fn(),
      drawImage: vi.fn(),
      restore: vi.fn(),
    } as unknown as Canvas2DContext;
    const sample = { camera: camera(0.5, 0.5, 1), weight: 0.25 };

    compositeIsolatedMotionBlurSample({
      target,
      surface,
      logicalWidth: 32,
      logicalHeight: 18,
      pixelScale: 1,
      sample,
      accumulatedWeight: 0.5,
      draw: vi.fn(),
    });

    expect(target.globalAlpha).toBeCloseTo(1 / 3, 12);
    expect(target.save).toHaveBeenCalledOnce();
    expect(target.drawImage).toHaveBeenCalledWith(surface, 0, 0, 32, 18, 0, 0, 32, 18);
    expect(target.restore).toHaveBeenCalledOnce();
  });

  it('returns false without drawing when the motion-blur surface has no 2D context', () => {
    const target = {
      globalAlpha: 1,
      save: vi.fn(),
      drawImage: vi.fn(),
      restore: vi.fn(),
    } as unknown as Canvas2DContext;
    const surface = {
      width: 32,
      height: 18,
      getContext: vi.fn(() => null),
    } as unknown as MotionBlurSurface;
    const draw = vi.fn();

    expect(
      compositeIsolatedMotionBlurSample({
        target,
        surface,
        logicalWidth: 32,
        logicalHeight: 18,
        pixelScale: 1,
        sample: { camera: camera(0.5, 0.5, 1), weight: 1 },
        accumulatedWeight: 0,
        draw,
      }),
    ).toBe(false);
    expect(surface.getContext).toHaveBeenCalledOnce();
    expect(draw).not.toHaveBeenCalled();
    expect(target.drawImage).not.toHaveBeenCalled();
  });

  it('is deterministic and bounded at temporal and intensity edges', () => {
    const input = {
      previous: camera(0.2, 0.8, 1.1),
      current: camera(0.8, 0.2, 1.8),
      intensity: 4,
      deltaMs: -16,
      sampleCount: 99,
    };

    const first = createZoomMotionBlurSamplePlan(input);
    const second = createZoomMotionBlurSamplePlan(input);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(1);
    expect(first.length).toBeLessThanOrEqual(5);
    expect(first.every(({ weight }) => weight >= 0 && weight <= 1)).toBe(true);
    expect(first.reduce((total, { weight }) => total + weight, 0)).toBeCloseTo(1, 12);
  });
});
