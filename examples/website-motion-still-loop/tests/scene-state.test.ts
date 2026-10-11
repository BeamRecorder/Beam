import { describe, expect, it } from 'vitest';
import { frameNumber, seekSeconds, stillTimeMs, timecode } from '../src/scene-state';

describe('shared artwork clock', () => {
  it.each([
    [0, 0],
    [2400, 2.4],
    [7000, 7],
    [-1, 0],
    [8000, 7],
  ])('bounds %s ms to %s seconds', (input, seconds) => {
    expect(seekSeconds(input)).toBe(seconds);
  });
  it.each([NaN, Infinity, -Infinity])('rejects invalid seek time %s', (input) => {
    expect(() => seekSeconds(input)).toThrow('Seek time must be finite');
  });
  it('identifies the exact PNG frame in the 60 fps source', () => {
    expect(frameNumber(stillTimeMs)).toBe(144);
    expect(timecode(stillTimeMs)).toBe('00:02.40');
  });
});
describe('video frame labels', () => {
  it.each([
    [0, 0],
    [16, 0],
    [17, 1],
    [2400, 144],
    [6983.333334, 419],
  ])('labels %s ms as frame %s', (input, frame) => {
    expect(frameNumber(input)).toBe(frame);
  });
  it('bounds frame indices at each end of the loop', () => {
    expect(frameNumber(-5)).toBe(0);
    expect(frameNumber(8000)).toBe(420);
  });
  it('propagates non-finite input errors', () => {
    expect(() => frameNumber(NaN)).toThrow();
  });
});
describe('timecode', () => {
  it.each([
    [0, '00:00.00'],
    [10, '00:00.01'],
    [999, '00:01.00'],
    [2400, '00:02.40'],
    [6983.333334, '00:06.98'],
  ])('formats %s ms as %s', (input, expected) => {
    expect(timecode(input)).toBe(expected);
  });
  it('bounds labels before and after the composition', () => {
    expect(timecode(-1)).toBe('00:00.00');
    expect(timecode(8000)).toBe('00:07.00');
  });
  it('rejects clocks that cannot describe a real frame', () => {
    expect(() => timecode(Infinity)).toThrow();
  });
});
