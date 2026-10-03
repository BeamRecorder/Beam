import { describe, expect, it, vi } from 'vitest';
import { createOrderedTimelineIndex } from '../ordered-timeline-index';
import { createTimelineIntervalIndex } from '../timeline-interval-index';

describe('ordered timeline index', () => {
  it('queries and sorts 10000 simultaneous records once across 60 playback ticks', () => {
    const intervals = Array.from({ length: 10000 }, (_, value) => ({ start: 0, end: 60000, value }));
    const compare = vi.fn((a: number, b: number) => b - a);
    const at = createOrderedTimelineIndex(intervals, compare);
    const first = at(1);
    expect(first).toHaveLength(10000);
    expect(first[0]).toBe(9999);
    const comparisons = compare.mock.calls.length;
    for (let frame = 1; frame <= 60; frame++) expect(at(1 + (frame * 1000) / 60)).toBe(first);
    expect(compare).toHaveBeenCalledTimes(comparisons);
    expect(at(0.5)).toBe(first);
  });

  it('changes membership at cuts, across gaps and reverse seeks without changing half-open intervals', () => {
    const at = createOrderedTimelineIndex(
      [
        { start: 0, end: 10, value: 1 },
        { start: 10, end: 20, value: 2 },
        { start: 10, end: 20, value: 3 },
        { start: 30, end: 40, value: 4 },
      ],
      (a, b) => b - a,
    );
    expect(at(5)).toEqual([1]);
    expect(at(10 - Number.EPSILON * 10)).toEqual([3, 2]);
    expect(at(10)).toEqual([3, 2]);
    expect(at(15)).toEqual([3, 2]);
    expect(at(20)).toEqual([]);
    expect(at(25)).toEqual([]);
    expect(at(35)).toEqual([4]);
    expect(at(5)).toEqual([1]);
    expect(at(-1)).toEqual([]);
    expect(at(40)).toEqual([]);
  });

  it('matches the uncached index even in overlapping floating-point snapping bands', () => {
    const intervals = [
      { start: 1, end: 1 + Number.EPSILON, value: 1 },
      { start: 1 + Number.EPSILON, end: 2, value: 2 },
      { start: -20, end: 0, value: 3 },
    ];
    const cached = createOrderedTimelineIndex(intervals, (a, b) => a - b);
    const original = createTimelineIntervalIndex(intervals);
    for (const time of [0, 0.5, 1, 1 + Number.EPSILON, 1 + 8 * Number.EPSILON, 1.1, 0.5, 2, 2.5])
      expect(cached(time)).toEqual(original(time).sort((a, b) => a - b));
  });

  it('ignores invalid intervals and queries without poisoning the retained finite window', () => {
    const at = createOrderedTimelineIndex(
      [
        { start: NaN, end: 3, value: 1 },
        { start: 0, end: Infinity, value: 2 },
        { start: 3, end: 3, value: 3 },
        { start: 4, end: 2, value: 4 },
        { start: 0, end: 3, value: 5 },
      ],
      (a, b) => a - b,
    );
    const first = at(1);
    expect(first).toEqual([5]);
    for (const time of [NaN, Infinity, -Infinity]) expect(at(time)).toEqual([]);
    expect(at(2)).toBe(first);
    const empty = createOrderedTimelineIndex<number>([], (a, b) => a - b);
    expect(empty(0)).toEqual([]);
    expect(empty(5)).toBe(empty(0));
  });

  it('preserves stable tie order and isolates rebuilt indexes after edits', () => {
    const intervals = [2, 1, 3].map((value) => ({ start: 0, end: 3, value }));
    const first = createOrderedTimelineIndex(intervals, () => 0);
    expect(first(1)).toEqual([1, 2, 3]); // The interval tree query remains the tie-order authority.
    const edited = createOrderedTimelineIndex(
      intervals.map((item) => ({ ...item, start: 2 })),
      (a, b) => b - a,
    );
    expect(edited(1)).toEqual([]);
    expect(edited(2.5)).toEqual([3, 2, 1]);
    expect(first(1)).toEqual([1, 2, 3]);
  });
});
