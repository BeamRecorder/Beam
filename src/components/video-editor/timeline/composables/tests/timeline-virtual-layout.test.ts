import { describe, expect, it } from 'vitest';
import { layoutTimelineRows, visibleTimelineRows } from '../timeline-virtual-layout';
import { createTimelineRangeIndex } from '../timeline-range-index';
import type { TimelineVirtualRow } from '../timeline-virtualization-types';

describe('timeline row virtualization', () => {
  const rows = (count: number): TimelineVirtualRow[] =>
    Array.from({ length: count }, (_, index) => ({ id: `row-${index}`, kind: 'visual', clips: [] }));
  it('keeps the complete scroll extent while mounting a bounded middle window of 10000 lanes', () => {
    const layout = layoutTimelineRows(rows(10000), 400);
    expect(layout.at(-1)).toMatchObject({ top: 319968, height: 32 });
    const visible = visibleTimelineRows(layout, 160000, 400);
    expect(visible.length).toBeLessThan(22);
    expect(visible[0]!.id).toBe('row-4996');
    expect(visible.at(-1)!.id).toBe('row-5015');
  });
  it('shares deterministic variable heights between headers and every category', () => {
    const layout = layoutTimelineRows(
      [
        { id: 'video', kind: 'visual', clips: [] },
        { id: 'caption', kind: 'effect', clips: [] },
        { id: 'audio', kind: 'audio', clips: [] },
      ],
      150,
    );
    expect(layout[0]!.height).toBe(47);
    expect(layout[1]!.height).toBe(63);
    expect(layout[2]!.top).toBe(110);
    expect(layout[2]!.height).toBe(40);
    expect(layoutTimelineRows(rows(1), 1000)[0]!.height).toBe(56);
  });
  it('keeps minimum heights in undersized viewports and handles empty and fully capped stacks', () => {
    expect(layoutTimelineRows([], 1000)).toEqual([]);
    expect(layoutTimelineRows(rows(2), -100).map((row) => row.height)).toEqual([32, 32]);
    expect(layoutTimelineRows([{ id: 'audio', kind: 'audio', clips: [] }], 1000)[0]!.height).toBe(40);
    expect(layoutTimelineRows([{ id: 'effect', kind: 'effect', clips: [] }], 1000)[0]!.height).toBe(64);
  });
  it('pins only the active gesture row, not an arbitrarily large selection', () => {
    const layout = layoutTimelineRows(rows(10000), 400);
    const visible = visibleTimelineRows(layout, 200000, 400, 'row-1');
    expect(visible.at(-1)!.id).toBe('row-1');
    expect(visible.length).toBeLessThan(23);
    expect(visibleTimelineRows(layout, 0, 0, 'missing').length).toBe(4);
    expect(visibleTimelineRows([], 100, 400)).toEqual([]);
  });
});

describe('timeline horizontal interval queries', () => {
  it('finds long clips crossing the viewport and preserves original paint order', () => {
    const items = [
      { id: 'b', start: 100, end: 150 },
      { id: 'long', start: 0, end: 10000 },
      { id: 'a', start: 120, end: 180 },
    ];
    const at = createTimelineRangeIndex(items, (item) => item);
    expect(at(130, 140).map((item) => item.id)).toEqual(['b', 'long', 'a']);
    expect(at(9000, 9100).map((item) => item.id)).toEqual(['long']);
  });
  it('handles cut boundaries and malformed intervals without losing neighboring clips', () => {
    const at = createTimelineRangeIndex(
      [
        { start: 0, end: 40 },
        { start: 40, end: 80 },
        { start: NaN, end: 90 },
        { start: 90, end: 80 },
      ],
      (item) => item,
    );
    expect(at(40, 40)).toHaveLength(2);
    expect(at(NaN, 40)).toEqual([]);
    expect(at(50, 40)).toEqual([]);
    expect(at(100, Infinity)).toEqual([]);
    expect(at(-100, -10)).toEqual([]);
  });
  it('matches brute force for 10000 randomly distributed intervals and wide horizontal seeks', () => {
    const items = Array.from({ length: 10000 }, (_, index) => ({
      start: (index * 7919) % 60000,
      end: ((index * 7919) % 60000) + 1000,
    }));
    const at = createTimelineRangeIndex(items, (item) => item);
    for (let start = 0; start < 60000; start += 3197)
      expect(at(start, start + 150)).toEqual(items.filter((item) => item.start <= start + 150 && item.end >= start));
  });
});
