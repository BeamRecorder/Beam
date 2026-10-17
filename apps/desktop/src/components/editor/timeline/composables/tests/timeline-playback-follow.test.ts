import { describe, expect, it, vi } from 'vitest';
import { createTimelinePlaybackFollow } from '../timeline-playback-follow';

const setup = (scale = 1, scrollLeft = 0) => {
  const scroll = document.createElement('div');
  Object.defineProperty(scroll, 'clientWidth', { value: 500 });
  scroll.scrollLeft = scrollLeft;
  const viewport = new DOMRect(120, 0, 500 * scale, 200);
  const ruler = new DOMRect(120 + (80 - scrollLeft) * scale, 0, 2000 * scale, 28);
  const follow = createTimelinePlaybackFollow();
  follow.measure(scroll, viewport, ruler);
  return { scroll, viewport, ruler, follow };
};

describe('cached playback follow geometry', () => {
  it.each([0.75, 1, 1.25, 2])(
    'follows and returns through both edges at scale %s without additional DOM reads',
    (scale) => {
      const { follow, scroll } = setup(scale, 100);
      const bounds = vi.spyOn(scroll, 'getBoundingClientRect').mockImplementation(() => {
        throw new Error('Unexpected layout read');
      });
      const next = 100 + follow.delta(8, 10, 100);
      expect(next).toBeCloseTo(1605);
      expect(follow.delta(8, 10, next)).toBeCloseTo(0);
      expect(next + follow.delta(0, 10, next)).toBeCloseTo(5);
      expect(bounds).not.toHaveBeenCalled();
    },
  );

  it('refreshes its geometry after resize, scaling, zoom and a changed content origin', () => {
    const { follow, scroll } = setup();
    expect(follow.delta(8, 10, 0)).toBe(1605);
    scroll.scrollLeft = 400;
    follow.measure(scroll, new DOMRect(800, 0, 1000, 200), new DOMRect(160, 0, 8000, 28));
    expect(follow.delta(2, 10, 400)).toBe(405);
    expect(follow.delta(2, 10, 805)).toBe(0);
  });

  it('stays idle before a measurement, for hidden geometry and invalid duration or scroll offsets', () => {
    expect(createTimelinePlaybackFollow().delta(8, 10, 0)).toBe(0);
    const { follow, scroll, ruler } = setup();
    for (const duration of [0, -1, Infinity, NaN]) expect(follow.delta(8, duration, 0)).toBe(0);
    expect(follow.delta(8, 10, NaN)).toBe(0);
    follow.measure(scroll, new DOMRect(0, 0, 0, 0), ruler);
    expect(follow.delta(8, 10, 0)).toBe(0);
    follow.measure(scroll, new DOMRect(NaN, 0, 500, 200), ruler);
    expect(follow.delta(8, 10, 0)).toBe(0);
  });

  it('clamps invalid and out-of-range playheads to the project boundaries', () => {
    const { follow } = setup();
    expect(follow.delta(NaN, 10, 0)).toBe(0);
    expect(follow.delta(-100, 10, 0)).toBe(0);
    expect(follow.delta(Infinity, 10, 0)).toBe(0);
    expect(follow.delta(100, 10, 0)).toBe(follow.delta(10, 10, 0));
  });
});
