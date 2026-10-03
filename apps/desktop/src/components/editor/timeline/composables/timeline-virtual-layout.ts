import type { TimelineVirtualRow, TimelinePositionedRow } from './timeline-virtualization-types';

const minimumHeight = 32;
const maximumHeight = 56;

export function layoutTimelineRows(
  rows: readonly TimelineVirtualRow[],
  viewportHeight: number,
): TimelinePositionedRow[] {
  if (!rows.length) return [];
  const height = Math.min(maximumHeight, Math.max(minimumHeight, viewportHeight / rows.length));
  return rows.map((row, index) => ({ ...row, top: index * height, height }));
}

export function visibleTimelineRows(
  rows: readonly TimelinePositionedRow[],
  top: number,
  height: number,
  pinnedId: string | null = null,
): TimelinePositionedRow[] {
  const start = Math.max(0, top - 96);
  const end = top + Math.max(0, height) + 96;
  let low = 0,
    high = rows.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (rows[middle]!.top + rows[middle]!.height < start) low = middle + 1;
    else high = middle;
  }
  const result: TimelinePositionedRow[] = [];
  for (let index = low; index < rows.length && rows[index]!.top <= end; index++) result.push(rows[index]!);
  if (pinnedId && !result.some((row) => row.id === pinnedId)) {
    const pinned = rows.find((row) => row.id === pinnedId);
    if (pinned) result.push(pinned);
  }
  return result;
}
