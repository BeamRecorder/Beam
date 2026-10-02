/** Range intersection with stable input order; indexes are immutable gesture/layout snapshots. */
export function createTimelineRangeIndex<T>(
  items: readonly T[],
  interval: (item: T) => { start: number; end: number },
) {
  const nodes = items
    .map((item, order) => ({ ...interval(item), item, order, maximumEnd: 0 }))
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end >= item.start)
    .sort((a, b) => a.start - b.start);
  const build = (low: number, high: number): number => {
    if (low >= high) return -Infinity;
    const middle = (low + high) >>> 1;
    const node = nodes[middle]!;
    return (node.maximumEnd = Math.max(node.end, build(low, middle), build(middle + 1, high)));
  };
  build(0, nodes.length);
  return (start: number, end: number): T[] => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return [];
    const result: typeof nodes = [];
    const visit = (low: number, high: number) => {
      if (low >= high || nodes[low]!.start > end) return;
      const middle = (low + high) >>> 1;
      const node = nodes[middle]!;
      if (node.maximumEnd < start) return;
      if (node.start <= end && node.end >= start) result.push(node);
      visit(low, middle);
      visit(middle + 1, high);
    };
    visit(0, nodes.length);
    return result.sort((a, b) => a.order - b.order).map((node) => node.item);
  };
}
