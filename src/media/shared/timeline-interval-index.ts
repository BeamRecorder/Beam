import { snapTimeToBoundary } from './time-boundary';
import type { TimelineInterval, TimelineIntervalNode } from './timeline-interval-types';

/** Snapshot the timing once; rebuild after edits. Queries visit only overlapping subtrees. */
export function createTimelineIntervalIndex<T>(intervals: readonly TimelineInterval<T>[]) {
  const nodes: TimelineIntervalNode<T>[] = intervals
    .map(({ start, end, value }) => ({ start, end, value, maximumEnd: end }))
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && start < end)
    .sort((left, right) => left.start - right.start);

  const build = (low: number, high: number): number => {
    if (low >= high) return -Infinity;
    const middle = (low + high) >>> 1;
    const node = nodes[middle]!;
    node.maximumEnd = Math.max(node.end, build(low, middle), build(middle + 1, high));
    return node.maximumEnd;
  };
  build(0, nodes.length);

  return (time: number): T[] => {
    const matches: T[] = [];
    if (!Number.isFinite(time)) return matches;
    const visit = (low: number, high: number) => {
      if (low >= high) return;
      const minimumStart = nodes[low]!.start;
      const middle = (low + high) >>> 1;
      const node = nodes[middle]!;
      // Conservative pruning keeps the same floating-point cut tolerance as playback.
      if (time < minimumStart && snapTimeToBoundary(time, minimumStart) !== minimumStart) return;
      if (time > node.maximumEnd && snapTimeToBoundary(time, node.maximumEnd) !== node.maximumEnd) return;
      const snapped = snapTimeToBoundary(time, node.start, node.end);
      if (snapped >= node.start && snapped < node.end) matches.push(node.value);
      visit(low, middle);
      visit(middle + 1, high);
    };
    visit(0, nodes.length);
    return matches;
  };
}
