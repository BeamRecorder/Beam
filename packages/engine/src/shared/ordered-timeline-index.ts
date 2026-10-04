import { createTimelineIntervalIndex } from './timeline-interval-index';
import { snapTimeToBoundary } from './time-boundary';
import type { TimelineInterval } from './timeline-interval-types';

/** Keep one ordered active window. Edits rebuild the index; animation still samples every tick. */
export function createOrderedTimelineIndex<T>(
  intervals: readonly TimelineInterval<T>[],
  compare: (left: T, right: T) => number,
) {
  const valid = intervals.filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && start < end);
  const at = createTimelineIntervalIndex(valid);
  const boundaries = [...new Set(valid.flatMap(({ start, end }) => [start, end]))].sort((a, b) => a - b);
  let segment = -1;
  let ordered: readonly T[] = [];

  return (time: number): readonly T[] => {
    if (!Number.isFinite(time)) return [];
    let low = 0;
    let high = boundaries.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      const boundary = boundaries[middle]!;
      if (time >= boundary) low = middle + 1;
      else high = middle;
    }
    const lower = boundaries[low - 1];
    const upper = boundaries[low];
    // Overlapping floating-point snapping bands can give a tiny interval special boundary semantics.
    if (
      (lower !== undefined && snapTimeToBoundary(time, lower) === lower) ||
      (upper !== undefined && snapTimeToBoundary(time, upper) === upper)
    ) {
      segment = -1;
      return at(time).sort(compare);
    }
    if (segment !== low) {
      ordered = at(time).sort(compare);
      segment = low;
    }
    return ordered;
  };
}
