import { describe, expect, it } from 'vitest';
import { rippleZooms } from './timeline-ripple-zooms';
import type { ZoomElement } from '../zoom/zoom-types';
const zoom = (id: string, startMs: number, endMs: number): ZoomElement => ({
  id,
  startMs,
  endMs,
  sessionId: 'recording',
  depth: 2,
  mode: 'auto',
  focus: { cx: 0.2, cy: 0.4 },
});
const range = { startMs: 1000, endMs: 3000 };
describe('zoom edits when closing empty time', () => {
  it('preserves preceding regions and shifts following ones by the exact removed duration', () => {
    const before = zoom('before', 0, 1000),
      after = zoom('after', 3000, 4000);
    const result = rippleZooms([before, after], range);
    expect(result[0]).toBe(before);
    expect(result[1]).toEqual({ ...after, startMs: 1000, endMs: 2000 });
    expect(after.startMs).toBe(3000);
  });
  it('trims zooms crossing either edge and shortens those spanning the whole empty interval', () => {
    const result = rippleZooms([zoom('left', 500, 2500), zoom('right', 2000, 3500), zoom('both', 500, 3500)], range);
    expect(result.map((value) => [value.id, value.startMs, value.endMs])).toEqual([
      ['left', 500, 1000],
      ['right', 1000, 1500],
      ['both', 500, 1500],
    ]);
  });
  it('removes regions wholly inside the gap and fragments too short to remain useful', () => {
    expect(rippleZooms([zoom('inside', 1000, 3000), zoom('short', 950, 1100)], range)).toEqual([]);
    expect(rippleZooms([], range)).toEqual([]);
  });
});
