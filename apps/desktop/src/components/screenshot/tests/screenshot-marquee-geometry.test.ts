import { describe, it, expect } from 'vitest';
import { screenshotMarqueeTargetsInSurface } from '../screenshot-marquee-geometry';
const targets = [{ id: 'a', x: 80, y: 45, width: 160, height: 90, backdrop: true }];
const viewport = { width: 800, height: 450 };
const surface = { x: 100, y: 50, width: 1200, height: 700 };
const canvas = { x: 300, y: 150, width: 800, height: 450 };
describe('workspace marquee coordinates', () => {
  it('adds the canvas offset so a rectangle can start outside the canvas', () => {
    expect(screenshotMarqueeTargetsInSurface(targets, viewport, canvas, surface, surface)).toEqual([
      { ...targets[0], x: 280, y: 145 },
    ]);
    expect(targets[0]!.x).toBe(80);
  });
  it('accounts for a zoomed and panned canvas without discarding negative coordinates', () => {
    const next = screenshotMarqueeTargetsInSurface(
      targets,
      viewport,
      { x: -200, y: -50, width: 1600, height: 900 },
      surface,
      surface,
    );
    expect(next).toEqual([{ ...targets[0], x: -140, y: -10, width: 320, height: 180 }]);
  });
  it('converts screen coordinates back to logical pixels under editor UI scaling', () => {
    const next = screenshotMarqueeTargetsInSurface(targets, viewport, canvas, surface, {
      width: 800,
      height: 700 / 1.5,
    });
    expect(next[0]!.x).toBeCloseTo(280 / 1.5);
    expect(next[0]!.y).toBeCloseTo(145 / 1.5);
    expect(next[0]!.width).toBeCloseTo(160 / 1.5);
    expect(next[0]!.height).toBeCloseTo(90 / 1.5);
  });
  it.each([0, -1, NaN, Infinity])('ignores unavailable or invalid dimensions %s', (size) => {
    expect(screenshotMarqueeTargetsInSurface(targets, { ...viewport, width: size }, canvas, surface, surface)).toEqual(
      [],
    );
    expect(screenshotMarqueeTargetsInSurface(targets, viewport, canvas, { ...surface, height: size }, surface)).toEqual(
      [],
    );
  });
  it('keeps an empty target list empty', () => {
    expect(screenshotMarqueeTargetsInSurface([], viewport, canvas, surface, surface)).toEqual([]);
  });
});
