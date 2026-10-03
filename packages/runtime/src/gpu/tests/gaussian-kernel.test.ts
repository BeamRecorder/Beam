import { describe, expect, it } from 'vitest';
import { gaussianKernel, gaussianLevels } from '@beam/runtime/gpu/gaussian-kernel';

function discreteGaussian(sigma: number) {
  const radius = Math.ceil(3 * sigma);
  const weights = Array.from({ length: radius + 1 }, (_, tap) => Math.exp(-(tap * tap) / (2 * sigma * sigma)));
  const sum = weights[0]! + 2 * weights.slice(1).reduce((total, weight) => total + weight, 0);
  return weights.map((weight) => weight / sum);
}

describe('bilinear Gaussian kernel', () => {
  it.each([0, -0, Number.MIN_VALUE, 0.02, 0.03])('uses an exact identity kernel for sigma %s', (sigma) => {
    const kernel = gaussianKernel(sigma);
    expect(kernel.radius).toBe(0);
    expect(kernel.center).toBe(1);
    expect(kernel.pairs).toBe(0);
    expect(kernel.weights).toBeInstanceOf(Float32Array);
    expect(kernel.offsets).toBeInstanceOf(Float32Array);
    expect(Array.from(kernel.weights)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(Array.from(kernel.offsets)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it.each([0.030001, 0.1, 0.5, 1, 1.7, 2, 3, 3.999999, 4])(
    'reconstructs a normalized symmetric discrete Gaussian for sigma %s',
    (sigma) => {
      const kernel = gaussianKernel(sigma);
      const expected = discreteGaussian(sigma);
      expect(kernel.radius).toBe(Math.ceil(3 * sigma));
      expect(kernel.pairs).toBe(Math.ceil(kernel.radius / 2));
      expect(kernel.weights).toHaveLength(6);
      expect(kernel.offsets).toHaveLength(6);
      expect(kernel.center).toBeCloseTo(expected[0]!, 7);

      const reconstructed = Array<number>(kernel.radius + 2).fill(0);
      reconstructed[0] = kernel.center;
      for (let pair = 0; pair < kernel.pairs; pair++) {
        const tap = 1 + pair * 2;
        const weight = kernel.weights[pair]!;
        const offset = kernel.offsets[pair]!;
        expect(Number.isFinite(weight)).toBe(true);
        expect(Number.isFinite(offset)).toBe(true);
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(offset).toBeGreaterThanOrEqual(tap);
        expect(offset).toBeLessThanOrEqual(Math.min(tap + 1, kernel.radius));
        const rightFraction = offset - tap;
        reconstructed[tap] = weight * (1 - rightFraction);
        reconstructed[tap + 1] = weight * rightFraction;
      }

      for (let tap = 0; tap < expected.length; tap++) {
        expect(reconstructed[tap]).toBeCloseTo(expected[tap]!, 7);
      }
      expect(reconstructed[kernel.radius + 1]).toBe(0);
      expect(kernel.center + 2 * kernel.weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 7);

      let mass = kernel.center;
      let firstMoment = 0;
      let secondMoment = 0;
      let expectedSecondMoment = 0;
      for (let tap = 1; tap <= kernel.radius; tap++) {
        const weight = reconstructed[tap]!;
        mass += 2 * weight;
        firstMoment += tap * weight + -tap * weight;
        secondMoment += 2 * tap * tap * weight;
        expectedSecondMoment += 2 * tap * tap * expected[tap]!;
      }
      expect(mass).toBeCloseTo(1, 7);
      expect(firstMoment).toBe(0);
      expect(secondMoment).toBeCloseTo(expectedSecondMoment, 5);
      expect(Array.from(kernel.weights.slice(kernel.pairs))).toEqual(Array(6 - kernel.pairs).fill(0));
      expect(Array.from(kernel.offsets.slice(kernel.pairs))).toEqual(Array(6 - kernel.pairs).fill(0));
    },
  );

  it.each([0.1, 0.7, 1.5, 2.9])('retains the unpaired final tap for sigma %s', (sigma) => {
    const kernel = gaussianKernel(sigma);
    const expected = discreteGaussian(sigma);
    expect(kernel.radius % 2).toBe(1);
    expect(kernel.offsets[kernel.pairs - 1]).toBe(kernel.radius);
    expect(kernel.weights[kernel.pairs - 1]).toBeCloseTo(expected[kernel.radius]!, 7);
  });

  it('does not expose mutable arrays shared between calls', () => {
    const first = gaussianKernel(2);
    const second = gaussianKernel(2);
    first.weights.fill(42);
    first.offsets.fill(-42);
    expect(Array.from(second.weights)).toEqual(Array.from(gaussianKernel(2).weights));
    expect(Array.from(second.offsets)).toEqual(Array.from(gaussianKernel(2).offsets));
    expect(first.weights).not.toBe(second.weights);
    expect(first.offsets).not.toBe(second.offsets);
  });

  it.each([-Number.MIN_VALUE, -1, 4.000000001, NaN, Infinity, -Infinity])(
    'rejects invalid kernel sigma %s',
    (sigma) => {
      expect(() => gaussianKernel(sigma)).toThrow(RangeError);
    },
  );
});

describe('Gaussian downsample levels', () => {
  it.each([0, Number.MIN_VALUE, 0.03, 1, 4])(
    'preserves the original resolution when sigma %s already fits',
    (sigma) => {
      const levels = gaussianLevels(1920, 1080, sigma);
      expect(levels).toHaveLength(1);
      expect(levels[0]?.width).toBe(1920);
      expect(levels[0]?.height).toBe(1080);
      expect(levels[0]?.sigmaX).toBeCloseTo(sigma, 14);
      expect(levels[0]?.sigmaY).toBeCloseTo(sigma, 14);
    },
  );

  it('halves large levels before reaching the exact bounded-kernel resolution', () => {
    const levels = gaussianLevels(1920, 1080, 48);
    expect(levels).toEqual([
      { width: 1920, height: 1080, sigmaX: 48, sigmaY: 48 },
      { width: 960, height: 540, sigmaX: 24, sigmaY: 24 },
      { width: 480, height: 270, sigmaX: 12, sigmaY: 12 },
      { width: 240, height: 135, sigmaX: 6, sigmaY: 6 },
      { width: 160, height: 90, sigmaX: 4, sigmaY: 4 },
    ]);
  });

  it('does not duplicate the final level when the target is an exact halving', () => {
    expect(gaussianLevels(1920, 1080, 16)).toEqual([
      { width: 1920, height: 1080, sigmaX: 16, sigmaY: 16 },
      { width: 960, height: 540, sigmaX: 8, sigmaY: 8 },
      { width: 480, height: 270, sigmaX: 4, sigmaY: 4 },
    ]);
  });

  it('keeps the original per-axis scale when dimensions are odd', () => {
    const levels = gaussianLevels(101, 55, 12);
    expect(levels.map(({ width, height }) => [width, height])).toEqual([
      [101, 55],
      [50, 27],
      [33, 18],
    ]);
    for (const level of levels) {
      expect(level.sigmaX).toBeCloseTo((12 * level.width) / 101, 12);
      expect(level.sigmaY).toBeCloseTo((12 * level.height) / 55, 12);
    }
  });

  it('can continue reducing one dimension after the other reaches one pixel', () => {
    const levels = gaussianLevels(3, 100, 48);
    expect(levels.map(({ width, height }) => [width, height])).toEqual([
      [3, 100],
      [1, 50],
      [1, 25],
      [1, 12],
      [1, 8],
    ]);
    expect(levels.at(-1)).toEqual({ width: 1, height: 8, sigmaX: 16, sigmaY: 3.84 });
  });

  it.each([
    [1, 1],
    [1, 2],
    [2, 1],
    [2, 3],
  ])('terminates without zero-size targets for %s × %s', (width, height) => {
    const levels = gaussianLevels(width, height, 48);
    expect(levels.length).toBeLessThanOrEqual(3);
    expect(levels[0]).toEqual({ width, height, sigmaX: 48, sigmaY: 48 });
    expect(levels.at(-1)).toEqual({
      width: 1,
      height: 1,
      sigmaX: 48 / width,
      sigmaY: 48 / height,
    });
    expect(new Set(levels.map((level) => `${level.width}:${level.height}`)).size).toBe(levels.length);
  });

  it('accepts safe integer dimensions without losing finite level geometry', () => {
    const width = Number.MAX_SAFE_INTEGER;
    const levels = gaussianLevels(width, width - 1, 48);
    expect(levels.length).toBeLessThan(64);
    expect(levels.at(-1)?.width).toBe(Math.floor(width / 12));
    expect(levels.at(-1)?.height).toBe(Math.floor((width - 1) / 12));
    for (const level of levels) {
      expect(Number.isSafeInteger(level.width)).toBe(true);
      expect(Number.isSafeInteger(level.height)).toBe(true);
      expect(Number.isFinite(level.sigmaX)).toBe(true);
      expect(Number.isFinite(level.sigmaY)).toBe(true);
    }
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid dimensions %s on either axis',
    (dimension) => {
      expect(() => gaussianLevels(dimension, 1080, 4)).toThrow(RangeError);
      expect(() => gaussianLevels(1920, dimension, 4)).toThrow(RangeError);
    },
  );

  it.each([-Number.MIN_VALUE, -1, 48.000000001, NaN, Infinity, -Infinity])(
    'rejects invalid level sigma %s',
    (sigma) => {
      expect(() => gaussianLevels(1920, 1080, sigma)).toThrow(RangeError);
    },
  );
});
