import { describe, expect, it } from 'vitest';
import { snapTimeToBoundary } from '../time-boundary';
import { createTimelineIntervalIndex } from '../timeline-interval-index';

describe('createTimelineIntervalIndex', () => {
  it('returns every nested, overlapping, and same-start interval containing the query', () => {
    const index = createTimelineIntervalIndex([
      { start: -10, end: 10, value: 'outer' },
      { start: -5, end: 5, value: 'inner' },
      { start: 0, end: 1, value: 'same-start-a' },
      { start: 0, end: 1, value: 'same-start-b' },
      { start: 2, end: 3, value: 'later' },
    ]);

    expect(index(0).sort()).toEqual(['inner', 'outer', 'same-start-a', 'same-start-b']);
    expect(index(2).sort()).toEqual(['inner', 'later', 'outer']);
    expect(index(5).sort()).toEqual(['outer']);
    expect(index(10)).toEqual([]);
  });

  it('supports negative intervals and snaps floating point neighbors to half-open cuts', () => {
    const index = createTimelineIntervalIndex([
      { start: -100, end: -1, value: 'negative' },
      { start: 1_000, end: 2_000, value: 'positive' },
    ]);
    const negativeEpsilon = Number.EPSILON * 100 * 8;
    const negativeEndEpsilon = Number.EPSILON * 8;
    const epsilon = Number.EPSILON * 1_000 * 8;
    const outsideTolerance = Number.EPSILON * 1_000 * 64;

    expect(index(-100 - negativeEpsilon)).toEqual(['negative']);
    expect(index(-1 - negativeEndEpsilon)).toEqual([]);
    expect(index(-1 - Number.EPSILON * 32)).toEqual(['negative']);
    expect(index(1_000 - epsilon)).toEqual(['positive']);
    expect(index(2_000 - epsilon)).toEqual([]);
    expect(index(1_000 - outsideTolerance)).toEqual([]);
    expect(index(2_000 - outsideTolerance)).toEqual(['positive']);
  });

  it('returns no results for non-finite queries and invalid interval endpoints', () => {
    const index = createTimelineIntervalIndex([
      { start: Number.NaN, end: 1, value: 'nan-start' },
      { start: 0, end: Number.POSITIVE_INFINITY, value: 'infinite-end' },
      { start: Number.NEGATIVE_INFINITY, end: 1, value: 'infinite-start' },
      { start: 2, end: 2, value: 'empty' },
      { start: 3, end: 2, value: 'reversed' },
      { start: -2, end: 2, value: 'valid' },
    ]);

    expect(index(Number.NaN)).toEqual([]);
    expect(index(Number.POSITIVE_INFINITY)).toEqual([]);
    expect(index(Number.NEGATIVE_INFINITY)).toEqual([]);
    expect(index(0)).toEqual(['valid']);
  });

  it('matches a naive snapped-interval oracle for deterministic random overlaps and far seeks', () => {
    let state = 0x2f_31_aa_09;
    const random = () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state / 0x1_0000_0000;
    };
    const intervals = Array.from({ length: 300 }, (_, value) => {
      const start = Math.round((random() * 2 - 1) * 50_000);
      const end = start + 1 + Math.round(random() * 8_000);
      return { start, end, value };
    });
    const queries = [
      -100_000,
      100_000,
      ...intervals.flatMap(({ start, end }) => [start, end, start - 0.25, end - 0.25]),
      ...Array.from({ length: 200 }, () => Math.round((random() * 2 - 1) * 100_000)),
    ];
    const index = createTimelineIntervalIndex(intervals);

    for (const time of queries) {
      const expected = intervals
        .filter(({ start, end }) => {
          const snapped = snapTimeToBoundary(time, start, end);
          return snapped >= start && snapped < end;
        })
        .map(({ value }) => value)
        .sort((left, right) => left - right);
      expect(
        index(time).sort((left, right) => left - right),
        `query at ${time}`,
      ).toEqual(expected);
    }
  });

  it('snapshots interval values once and does not reread original entries during queries', () => {
    let startReads = 0;
    let endReads = 0;
    let valueReads = 0;
    const interval = {
      get start() {
        startReads += 1;
        return 10;
      },
      get end() {
        endReads += 1;
        return 20;
      },
      get value() {
        valueReads += 1;
        return 'snapshot';
      },
    };
    const index = createTimelineIntervalIndex([interval]);
    const readsAfterBuild = [startReads, endReads, valueReads];

    expect(index(10)).toEqual(['snapshot']);
    expect(index(15)).toEqual(['snapshot']);
    expect(index(20)).toEqual([]);
    expect([startReads, endReads, valueReads]).toEqual(readsAfterBuild);
  });
});
