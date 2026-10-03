import { describe, expect, it } from 'vitest';
import {
  alignTransformToCanvas,
  editTransformPlacement,
  editTransformPixelSize,
  transformPixelSize,
  getTransformAlignment,
} from './transform-placement';
import type { NormalizedTransform } from '../shared/composition-types';
const original: NormalizedTransform = Object.freeze({ x: 0.13, y: -0.2, width: 0.4, height: 0.2 });

describe('transform placement editing', () => {
  it('changes coordinates without mutating the owned transform', () => {
    expect(editTransformPlacement(original, { x: 0.3 })).toEqual({ ...original, x: 0.3 });
    expect(editTransformPlacement(original, {})).toEqual(original);
    expect(original.x).toBe(0.13);
  });
  it('preserves proportions when resizing either dimension and supports independent dimensions', () => {
    expect(editTransformPlacement(original, { width: 0.8 })).toEqual({ ...original, width: 0.8, height: 0.4 });
    expect(editTransformPlacement(original, { height: 0.6 })).toEqual({ ...original, width: 1.2, height: 0.6 });
    expect(editTransformPlacement(original, { width: 0.8 }, false)).toEqual({ ...original, width: 0.8 });
    expect(editTransformPlacement(original, { width: 0.7, height: 0.9 })).toEqual({
      ...original,
      width: 0.7,
      height: 0.9,
    });
  });
  it('bounds position and both dimensions, including proportional extremes', () => {
    expect(editTransformPlacement(original, { x: -10, y: 9, width: 0, height: 12 })).toEqual({
      x: -3,
      y: 3,
      width: 0.02,
      height: 4,
    });
    expect(editTransformPlacement(original, { height: 100 }).width).toBe(4);
    expect(editTransformPlacement(original, { width: -1 }).height).toBe(0.02);
    expect(editTransformPlacement(original, { height: 400 })).toEqual({ ...original, width: 4, height: 2 });
    expect(editTransformPlacement(original, { width: -1 })).toEqual({ ...original, width: 0.04, height: 0.02 });
  });
  it.each([NaN, Infinity, -Infinity])('rejects non-finite patch %s', (value) => {
    expect(() => editTransformPlacement(original, { x: value })).toThrow('patch');
  });
});

describe('canvas alignment', () => {
  it('aligns every edge and center against the canvas, accounting for the actual size', () => {
    for (const x of [0, 0.5, 1] as const)
      for (const y of [0, 0.5, 1] as const) {
        const next = alignTransformToCanvas(original, { x, y });
        expect(next).toEqual({ ...original, x: 0.6 * x, y: 0.8 * y });
        expect(getTransformAlignment(next)).toEqual({ x, y });
      }
  });
  it('centers oversized clips and aligns their edges without reducing their size', () => {
    const large = { ...original, width: 2, height: 4 };
    expect(alignTransformToCanvas(large, { x: 0.5, y: 0.5 })).toEqual({ ...large, x: -0.5, y: -1.5 });
    expect(alignTransformToCanvas(large, { x: 1, y: 1 })).toEqual({ ...large, x: -1, y: -3 });
  });
  it('rejects invalid alignment values explicitly', () => {
    for (const value of [NaN, Infinity, -1, 0.4, 2]) {
      expect(() => alignTransformToCanvas(original, { x: value as 0, y: 0 })).toThrow('alignment');
      expect(() => alignTransformToCanvas(original, { x: 0, y: value as 0 })).toThrow('alignment');
    }
  });
  it('reports free placement independently on each axis, with a small rounding tolerance', () => {
    expect(getTransformAlignment(original)).toEqual({ x: null, y: null });
    expect(getTransformAlignment({ ...original, x: 0.3 + 0.000001 })).toEqual({ x: 0.5, y: null });
    expect(getTransformAlignment({ ...original, x: 0.3 + 0.0001 })).toEqual({ x: null, y: null });
    expect(getTransformAlignment({ x: 0, y: 0, width: 1, height: 1 })).toEqual({ x: 0.5, y: 0.5 });
  });
  it('returns a new aligned transform without mutating inputs', () => {
    const point = Object.freeze({ x: 0.5 as const, y: 0.5 as const });
    expect(alignTransformToCanvas(original, point)).not.toBe(original);
    expect(original).toEqual({ x: 0.13, y: -0.2, width: 0.4, height: 0.2 });
  });
});

it.each([
  { ...original, width: 0 },
  { ...original, height: -1 },
  { ...original, x: NaN },
])('rejects invalid transforms at every placement boundary %j', (value) => {
  expect(() => editTransformPlacement(value, {})).toThrow('placement');
  expect(() => alignTransformToCanvas(value, { x: 0, y: 0 })).toThrow('placement');
  expect(() => getTransformAlignment(value)).toThrow('placement');
});

it('expresses normalized dimensions in canvas pixels without rounding document values', () => {
  expect(transformPixelSize({ x: 0, y: 0, width: 0.5, height: 0.25 }, { width: 1920, height: 1080 })).toEqual({
    width: 960,
    height: 270,
  });
});
it('updates pixel dimensions through the same proportional size operation', () => {
  const transform = { x: 0.1, y: 0.2, width: 0.5, height: 0.5 };
  expect(editTransformPixelSize(transform, { width: 480 }, { width: 1920, height: 1080 })).toEqual({
    ...transform,
    width: 0.25,
    height: 0.25,
  });
  expect(editTransformPixelSize(transform, { height: 270 }, { width: 1920, height: 1080 }, false)).toEqual({
    ...transform,
    height: 0.25,
  });
  expect(editTransformPixelSize(transform, { width: 960, height: 270 }, { width: 1920, height: 1080 })).toEqual({
    ...transform,
    height: 0.25,
  });
  expect(editTransformPixelSize(transform, {}, { width: 1920, height: 1080 })).toEqual(transform);
});
it.each([
  { width: 0, height: 10 },
  { width: 10, height: -1 },
  { width: Infinity, height: 10 },
  { width: 10, height: NaN },
])('rejects invalid canvas pixel dimensions %s', (canvas) => {
  const transform = { x: 0, y: 0, width: 1, height: 1 };
  expect(() => transformPixelSize(transform, canvas)).toThrow();
  expect(() => editTransformPixelSize(transform, { width: 10 }, canvas)).toThrow();
});
it('rejects invalid pixel drafts and retains bounded normalized dimensions', () => {
  const transform = { x: 0, y: 0, width: 1, height: 1 };
  expect(() => editTransformPixelSize(transform, { width: NaN }, { width: 100, height: 100 })).toThrow();
  expect(editTransformPixelSize(transform, { width: 99999 }, { width: 100, height: 100 })).toMatchObject({
    width: 4,
    height: 4,
  });
});
