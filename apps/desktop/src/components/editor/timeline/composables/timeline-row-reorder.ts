import type { TimelineReorderRow } from './timeline-row-reorder-types';

/** Prepare lock barriers once; pointer frames inspect only the rows actually crossed. */
export function createTimelineRowReorder(rows: readonly TimelineReorderRow[]) {
  const locked = new Set(rows.filter((row) => row.clips.some((clip) => clip.locked)).map((row) => row.id));
  return (order: readonly string[], id: string, targetId: string, relativeY?: number): string[] | null => {
    const from = order.indexOf(id),
      to = order.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return null;
    // Spatial hysteresis prevents oscillation without a time-based pause between swaps.
    if (relativeY !== undefined && ((from < to && relativeY < 0.35) || (from > to && relativeY > 0.65))) return null;
    for (let index = Math.min(from, to); index <= Math.max(from, to); index++) {
      if (locked.has(order[index]!)) return null;
    }
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, id);
    return next;
  };
}
