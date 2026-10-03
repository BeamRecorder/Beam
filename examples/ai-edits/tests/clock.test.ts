import { describe, expect, it } from 'vitest';
import { compositionTime, BEAT_SECONDS, DURATION_MS } from '../src/clock';

describe('Beam composition clock', () => {
  it('converts exact frame times and all 32 musical beats to seconds', () => {
    expect(compositionTime(5625)).toBe(12 * BEAT_SECONDS);
    expect(compositionTime(1000 / 30)).toBeCloseTo(1 / 30);
    expect(32 * BEAT_SECONDS).toBe(DURATION_MS / 1000);
  });
  it('clamps before the beginning and holds the authored final pose', () => {
    expect(compositionTime(-1)).toBe(0);
    expect(compositionTime(0)).toBe(0);
    expect(compositionTime(15_000)).toBe(15);
    expect(compositionTime(90_000)).toBe(15);
  });
  it.each([NaN, Infinity, -Infinity])('rejects the invalid timestamp %s', timestamp => {
    expect(() => compositionTime(timestamp)).toThrow(RangeError);
  });
});
