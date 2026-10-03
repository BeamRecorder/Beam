import { describe, expect, it } from 'vitest';
import {
  clampGradientPosition,
  gradientCss,
  gradientStopColor,
  interpolateGradientStop,
  nextGradientStopPosition,
  normalizeGradient,
} from './gradient-stops';
import type { GradientStop } from './gradient-types';

const stops: GradientStop[] = [
  { id: 'a', position: 0.25, color: '#ff0000', alpha: 1 },
  { id: 'b', position: 0.75, color: '#0000ff', alpha: 1 },
];
describe('gradient stop math', () => {
  it.each([
    [-1, 0],
    [0.37, 0.37],
    [2, 1],
  ])('bounds %s to %s', (input, output) => {
    expect(clampGradientPosition(input)).toBe(output);
  });
  it.each([null, undefined, { stops: [] }])('creates an uncommitted draft from %s', (input) => {
    expect(normalizeGradient(input)).toEqual({
      type: 'linear',
      angle: 90,
      stops: [
        { id: 'gradient-start', position: 0, color: '#000000', alpha: 1 },
        { id: 'gradient-end', position: 1, color: '#ffffff', alpha: 1 },
      ],
    });
  });
  it('sorts and owns existing records without reducing position precision', () => {
    const original = [...stops].reverse();
    const normalized = normalizeGradient({ type: 'radial', angle: -45, stops: original });
    expect(normalized).toEqual({ type: 'radial', angle: 315, stops });
    expect(normalized.stops[0]).not.toBe(stops[0]);
    expect(original[0]!.id).toBe('b');
  });
  it('handles missing IDs and invalid or out-of-range draft fields deterministically', () => {
    const normalized = normalizeGradient({
      angle: Infinity,
      stops: [
        { id: '', color: 'invalid', position: NaN, alpha: Infinity },
        { id: 'b', color: '#abc', position: 7, alpha: -1 },
        { id: 'c', color: '#123456', position: -1, alpha: 8 },
      ],
    });
    expect(normalized.angle).toBe(90);
    expect(normalized.stops).toEqual([
      { id: 'gradient-stop-0', color: '#ffffff', position: 0, alpha: 1 },
      { id: 'c', color: '#123456', position: 0, alpha: 1 },
      { id: 'b', color: '#aabbcc', position: 1, alpha: 0 },
    ]);
  });
  it('distributes unset positions and handles one stop', () => {
    expect(
      normalizeGradient({ stops: [{ id: 'a', color: '#123456', position: NaN }] }).stops.some(
        (stop) => stop.id === 'a' && stop.position === 0,
      ),
    ).toBe(true);
    expect(
      normalizeGradient({ stops: stops.map((stop) => ({ ...stop, position: NaN })) }).stops.map(
        (stop) => stop.position,
      ),
    ).toEqual([0, 1]);
  });
  it.each([
    [{ ...stops[0]!, alpha: undefined }, 'rgba(255, 0, 0, 1)'],
    [{ ...stops[1]!, alpha: 0 }, 'rgba(0, 0, 255, 0)'],
    [{ ...stops[0]!, alpha: 0.25 }, 'rgba(255, 0, 0, 0.25)'],
  ])('serializes the color and alpha of %j', (stop, expected) => expect(gradientStopColor(stop)).toBe(expected));
  it('uses authored orientation for the preview and horizontal coordinates for the rail', () => {
    expect(gradientCss({ type: 'linear', angle: 180, stops })).toContain('linear-gradient(180deg');
    expect(gradientCss({ type: 'radial', stops })).toContain('radial-gradient(circle');
    expect(gradientCss({ type: 'radial', angle: 180, stops }, true)).toContain('linear-gradient(90deg');
    expect(gradientCss({ stops })).toContain('linear-gradient(90deg');
    expect(gradientCss({ stops: [{ ...stops[0]!, position: 0.123456 }] })).toContain('12.3456%');
  });
  it.each([
    [0, '#ff0000'],
    [0.5, '#800080'],
    [1, '#0000ff'],
  ])('interpolates inside and outside authored endpoints at %s', (position, color) =>
    expect(interpolateGradientStop(stops, position)).toEqual({ color, alpha: 1 }),
  );
  it('interpolates premultiplied colors and alpha without a dark fringe', () => {
    expect(interpolateGradientStop([{ ...stops[0]!, alpha: 0 }, stops[1]!], 0.5)).toEqual({
      color: '#0000ff',
      alpha: 0.5,
    });
    expect(
      interpolateGradientStop(
        stops.map((stop) => ({ ...stop, alpha: 0 })),
        0.5,
      ),
    ).toEqual({ color: '#000000', alpha: 0 });
  });
  it('handles equal positions, omitted alpha, a single endpoint and empty input', () => {
    expect(
      interpolateGradientStop(
        stops.map((stop) => ({ ...stop, position: 0.5 })),
        0.5,
      ).color,
    ).toBe('#0000ff');
    expect(
      interpolateGradientStop(
        stops.map((stop) => ({ ...stop, alpha: undefined })),
        0.5,
      ).alpha,
    ).toBe(1);
    expect(interpolateGradientStop([{ ...stops[0]!, alpha: undefined }], 0).alpha).toBe(1);
    expect(interpolateGradientStop([], 0.5)).toEqual({ color: '#000000', alpha: 1 });
  });
  it.each([
    ['a', 0.5],
    ['b', 0.5],
    [null, 0.5],
    ['missing', 0.5],
  ])('adds between selected stop %s and its neighbor', (id, expected) =>
    expect(nextGradientStopPosition([...stops].reverse(), id)).toBe(expected),
  );
  it('chooses halfway on an empty or single-stop draft', () => {
    expect(nextGradientStopPosition([], null)).toBe(0.5);
    expect(nextGradientStopPosition([stops[0]!], 'a')).toBe(0.5);
  });
});
