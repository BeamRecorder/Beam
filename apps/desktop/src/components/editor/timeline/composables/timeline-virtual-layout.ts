import type { TimelineVirtualRow, TimelinePositionedRow } from './timeline-virtualization-types';

const minimum = { visual: 32, effect: 48, audio: 32 };
const maximum = { visual: 56, effect: 64, audio: 40 };

export function layoutTimelineRows(
  rows: readonly TimelineVirtualRow[],
  viewportHeight: number,
): TimelinePositionedRow[] {
  const minimumHeight = rows.reduce((sum, row) => sum + minimum[row.kind], 0);
  let remaining = Math.max(0, viewportHeight - minimumHeight);
  let active = rows.length;
  let extra = 0;
  // Match flex-grow: redistribute space when audio/effect rows reach their maximum.
  for (const capacity of [8, 16, 24]) {
    if (!active) break;
    const available = (capacity - extra) * active;
    if (remaining <= available) {
      extra += remaining / active;
      break;
    }
    remaining -= available;
    extra = capacity;
    active -= rows.filter((row) => maximum[row.kind] - minimum[row.kind] === capacity).length;
  }
  let top = 0;
  return rows.map((row) => {
    const height = Math.min(maximum[row.kind], minimum[row.kind] + extra);
    const positioned = { ...row, top, height };
    top += height;
    return positioned;
  });
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
