import { expect, it } from 'vitest';
import { frameTimecode, parseTimecode } from './timecode';
it.each([[0, 30, '00:00:00:00'], [1000 / 30, 30, '00:00:00:01'], [61000, 30, '00:01:01:00'], [3600999, 60, '01:00:00:59'], [-1, 30, '00:00:00:00']])('formats frame time %s', (time, fps, expected) => expect(frameTimecode(Number(time), Number(fps))).toBe(expected));
it.each(['bad', '00:60:00:00', '00:00:60:00', '00:00:00:30', '-1:00:00:00'])('rejects impossible timecode %s', value => expect(parseTimecode(value, 30)).toBeUndefined());
it('round trips a frame position and supports rates clamped to one', () => {
  expect(parseTimecode('01:02:03:15', 30)).toBe(3723500);
  expect(frameTimecode(1000, 0)).toBe('00:00:01:00'); expect(parseTimecode('00:00:01:00', 0)).toBe(1000);
});
