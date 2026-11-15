import { describe, expect, it } from 'vitest';
import { formatPlaybackTime } from '../playback-time';
describe('playback timestamp', () => {
  it.each([
    [0, '00:00'],
    [12.9, '00:12'],
    [60, '01:00'],
    [3599, '59:59'],
    [3600, '01:00:00'],
    [3661, '01:01:01'],
    [360000, '100:00:00'],
  ])('formats %s seconds as %s', (time, label) => {
    expect(formatPlaybackTime(Number(time))).toBe(label);
  });
  it.each([-1, NaN, Infinity, -Infinity])('keeps unavailable and invalid time %s readable', (time) => {
    expect(formatPlaybackTime(time)).toBe('00:00');
  });
});
