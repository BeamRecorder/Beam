import { describe, expect, it } from 'vitest';
import { projectGridLayout } from './project-grid-layout';

describe('square project grid geometry', () => {
  it.each([0, -1, NaN, Infinity, -Infinity])('handles an unmeasured or invalid width (%s)', (width) => {
    expect(projectGridLayout(width, false)).toEqual({ columns: 1, cardSize: 0, rowHeight: 12 });
  });
  it.each([
    [367, 1],
    [368, 2],
    [555, 2],
    [556, 3],
    [744, 4],
  ])('uses %s px for %s columns', (width, columns) => {
    const result = projectGridLayout(width, false);
    expect(result.columns).toBe(columns);
    expect(result.cardSize * columns + (columns - 1) * 8).toBeCloseTo(width);
    expect(result.rowHeight).toBeCloseTo(result.cardSize + 12);
  });
  it('adapts to the compact project switcher and fractional dimensions', () => {
    expect(projectGridLayout(288, true)).toEqual({ columns: 2, cardSize: 140, rowHeight: 152 });
    expect(projectGridLayout(287, true).columns).toBe(1);
    expect(projectGridLayout(680.5, false).cardSize).toBeCloseTo(221.5);
  });
});
