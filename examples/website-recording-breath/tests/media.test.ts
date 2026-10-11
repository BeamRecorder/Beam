import { describe, expect, it } from 'vitest';
import { frameIndex } from '../src/media';

describe('supplied 24 fps footage clock', () => {
  it.each([
    [0, 0],
    [1 / 24, 1],
    [1.2, 28],
    [2.3, 55],
    [4.65, 111],
    [9.99, 239],
  ])('maps %s seconds to decoded frame %s', (time, frame) => expect(frameIndex(time)).toBe(frame));
  it.each([-1, NaN, Infinity, -Infinity])('uses the opening frame for an invalid time %s', (time) => {
    expect(frameIndex(time)).toBe(0);
  });
  it('holds the final playable frame at and beyond the endpoint', () => {
    expect(frameIndex(10)).toBe(239);
    expect(frameIndex(100)).toBe(239);
    expect(frameIndex(Number.MAX_VALUE)).toBe(239);
  });
  it('selects identical frames after backwards and non-sequential seeks', () => {
    expect([8, 0, 2.3, 10, 1.2, 2.3].map(frameIndex)).toEqual([192, 0, 55, 239, 28, 55]);
  });
});
