import { expect, it } from 'vitest';
import { compositionPositionAt, overCompositionDock } from '../composition-panel-dock-geometry';
import { compositionPanelLayout } from '../composition-panel-position';

it('accepts drops across the entire titlebar and its lower magnetic margin', () => {
  const target = { left: 0, top: 0, width: 1600, height: 40 };
  for (const [x, y] of [
    [0, 0],
    [800, 20],
    [1600, 40],
    [1530, 52],
  ])
    expect(overCompositionDock(x!, y!, target)).toBe(true);
});
it('rejects drops beyond the titlebar, out of window and nonfinite pointer positions', () => {
  const target = { left: 0, top: 0, width: 1600, height: 40 };
  for (const [x, y] of [
    [-1, 20],
    [1601, 20],
    [330, 53],
    [330, -1],
    [NaN, 10],
    [330, Infinity],
  ])
    expect(overCompositionDock(x!, y!, target)).toBe(false);
});
it('cannot dock to a missing, hidden or invalid-size target', () => {
  for (const target of [
    null,
    { left: 0, top: 0, width: 0, height: 28 },
    { left: 0, top: 0, width: 60, height: 0 },
    { left: 0, top: 0, width: -1, height: 28 },
  ])
    expect(overCompositionDock(0, 0, target)).toBe(false);
});
it('maps a grabbed header back to the same normalized floating position across UI scales', () => {
  for (const scale of [0.5, 0.75, 1, 1.25]) {
    const bounds = { width: 1200 / scale, height: 800 / scale, panelWidth: 264, headerHeight: 56 };
    for (const position of [
      { x: 0, y: 0 },
      { x: 0.35, y: 0.72 },
      { x: 1, y: 1 },
    ]) {
      const layout = compositionPanelLayout(bounds, position);
      const actual = compositionPositionAt(bounds, layout.x, layout.y);
      expect(actual.x).toBeCloseTo(position.x);
      expect(actual.y).toBeCloseTo(position.y);
    }
  }
});
it('clamps a pointer dragged beyond any edge without losing the floating handle', () => {
  const bounds = { width: 800, height: 600, panelWidth: 264, headerHeight: 56 };
  expect(compositionPositionAt(bounds, -10000, 10000)).toEqual({ x: 0, y: 1 });
  expect(compositionPositionAt(bounds, 10000, -10000)).toEqual({ x: 1, y: 0 });
});
it('keeps a panel reachable in a workspace with no available travel', () => {
  expect(compositionPositionAt({ width: 40, height: 20, panelWidth: 264, headerHeight: 56 }, 600, 600)).toEqual({
    x: 0,
    y: 0,
  });
});
