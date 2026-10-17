import type { LockableTimelineItem, TimelineOrderBucket, TimelineOrderEntry } from './timeline-lock-types';

/** Preserve ties and both sides of each locked layer without comparing every pair. */
export function preservesLockedOrder<T extends LockableTimelineItem>(
  before: readonly T[],
  next: ReadonlyMap<string, T>,
) {
  const entries: TimelineOrderEntry[] = [];
  for (const item of before) {
    const replacement = next.get(item.id);
    if (item.order !== undefined && replacement?.order !== undefined)
      entries.push({ before: item.order, after: replacement.order, locked: Boolean(item.locked) });
  }
  if (!entries.some((entry) => entry.locked)) return true;
  if (
    entries.some(
      (entry) =>
        Number.isNaN(entry.before) ||
        Number.isNaN(entry.after) ||
        (entry.locked && (!Number.isFinite(entry.before) || !Number.isFinite(entry.after))),
    )
  )
    return false;
  entries.sort((left, right) => left.before - right.before);
  const buckets: TimelineOrderBucket[] = [];
  for (const entry of entries) {
    const previous = buckets.at(-1);
    if (previous?.before === entry.before) {
      previous.min = Math.min(previous.min, entry.after);
      previous.max = Math.max(previous.max, entry.after);
      previous.locked ||= entry.locked;
    } else buckets.push({ before: entry.before, min: entry.after, max: entry.after, locked: entry.locked });
  }
  let earlierMax = -Infinity;
  for (const bucket of buckets) {
    if (bucket.locked && (bucket.min !== bucket.max || bucket.min <= earlierMax)) return false;
    earlierMax = Math.max(earlierMax, bucket.max);
  }
  let laterMin = Infinity;
  for (let index = buckets.length - 1; index >= 0; index--) {
    const bucket = buckets[index]!;
    if (bucket.locked && bucket.max >= laterMin) return false;
    laterMin = Math.min(laterMin, bucket.min);
  }
  return true;
}
