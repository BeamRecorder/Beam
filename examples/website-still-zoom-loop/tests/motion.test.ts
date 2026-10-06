import { describe, expect, it } from 'vitest';
import { CLICKS, clampTime, contentOpacity, createMotion, phaseTime, pointerAt, smooth, styleAt } from '../src/motion';
describe('Still zoom demonstration clock', () => {
  it.each([[NaN, 0], [Infinity, 0], [-Infinity, 0], [-200, 0], [4000, 4], [12000, 9]])('clamps %s to %s', (input, expected) => {
    expect(clampTime(input)).toBe(expected);
  });
  it.each([[-1, 0], [0, 0], [.5, .5], [1, 1], [2, 1]])('smooths %s without overshooting', (input, expected) => {
    expect(smooth(input)).toBe(expected);
  });
  it('switches styles only at the authored clicks', () => {
    expect([0, 2.64, 2.65, 5.09, 5.1, 8.64, 9].map(styleAt)).toEqual(['2d', '2d', '3d', '3d', 'glass', 'glass', '2d']);
  });
  it('resets under the fade and restores the matching opening frame', () => {
    expect(phaseTime(8.64)).toBe(8.64); expect(phaseTime(8.65)).toBe(0);
    expect(contentOpacity(8.6)).toBe(0); expect(contentOpacity(8.65)).toBe(0);
    expect(contentOpacity(8.4)).toBeGreaterThan(0); expect(contentOpacity(8.8)).toBeLessThan(1);
    expect(contentOpacity(0)).toBe(1); expect(contentOpacity(9)).toBe(1);
    expect(pointerAt(9)).toEqual(pointerAt(0));
  });
  it('uses one finite paused timeline with reversible seeks', () => {
    const pose = { time: 0 }, timeline = createMotion(pose);
    expect(timeline.paused()).toBe(true); expect(timeline.duration()).toBe(9);
    timeline.seek(6, false); expect(pose.time).toBe(6);
    timeline.seek(0, false); expect(pose.time).toBe(0); timeline.kill();
  });
  it('keeps every cursor sample finite and inside the presentation', () => {
    for (let t = -1; t <= 10; t += .025) {
      const point = pointerAt(t);
      expect(point.x).toBeGreaterThan(0); expect(point.x).toBeLessThan(1024);
      expect(point.y).toBeGreaterThan(0); expect(point.y).toBeLessThan(640);
      expect(Number.isFinite(point.scale)).toBe(true);
    }
  });
  it('adds a bounded press response at every click', () => {
    for (const click of CLICKS) {
      expect(pointerAt(click + .06).scale).toBeLessThan(1);
      expect(pointerAt(click + .06).scale).toBeGreaterThan(.7);
    }
  });
  it('moves the lens and cursor together while dragging', () => {
    const first = pointerAt(6.1), middle = pointerAt(6.45), last = pointerAt(6.8);
    expect(middle.x).toBeCloseTo((first.x + last.x) / 2);
    expect(middle.y).toBe(first.y); expect(last.y).toBe(first.y);
  });
});
