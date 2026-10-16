import type { CursorHoverSync, CursorHoverSource } from './cursor-hover-types';

export function validateCursorHoverSources(value: unknown): asserts value is CursorHoverSource[] {
  if (!Array.isArray(value) || value.length > 10_000) throw new TypeError('Invalid cursor hover sources.');
  let end = -1;
  for (const source of value) {
    if (
      !source ||
      typeof source.id !== 'string' ||
      !source.id.length ||
      source.id.length > 1024 ||
      typeof source.src !== 'string' ||
      !source.src.length ||
      source.src.length > 8192 ||
      !Number.isFinite(source.startSeconds) ||
      !Number.isFinite(source.durationSeconds) ||
      source.startSeconds < 0 ||
      source.startSeconds < end ||
      source.durationSeconds <= 0
    )
      throw new TypeError('Invalid cursor hover source.');
    end = source.startSeconds + source.durationSeconds;
    if (!Number.isSafeInteger(Math.ceil(end * 60))) throw new TypeError('Invalid cursor hover duration.');
  }
}

export const MAX_CURSOR_HOVER_RANGES = 250_000;
export const CURSOR_HOVER_ENTER_SECONDS = 0.06;
export const CURSOR_HOVER_EXIT_SECONDS = 0.12;

export function validateCursorHoverSync(value: unknown): asserts value is CursorHoverSync {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid cursor hover synchronization.');
  const sync = value as Partial<CursorHoverSync>;
  if (sync.version !== 1 || !Array.isArray(sync.ranges) || sync.ranges.length > MAX_CURSOR_HOVER_RANGES)
    throw new TypeError('Invalid cursor hover synchronization.');
  let previousEnd = -1;
  for (const range of sync.ranges) {
    if (
      !range ||
      !Number.isFinite(range.startSeconds) ||
      !Number.isFinite(range.endSeconds) ||
      range.startSeconds < 0 ||
      range.endSeconds <= range.startSeconds ||
      range.startSeconds <= previousEnd
    )
      throw new TypeError('Invalid cursor hover range.');
    previousEnd = range.endSeconds;
  }
}

const ease = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return Math.max(0, Math.min(1, t * t * t * (10 + t * (-15 + 6 * t))));
};

/** Smoothly pin to recorded motion at visual interactions; stateless for reverse seeks and export. */
export function cursorHoverWeightAt(sync: CursorHoverSync | undefined, time: number): number {
  if (!sync?.ranges.length || !Number.isFinite(time)) return 0;
  let low = 0;
  let high = sync.ranges.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (sync.ranges[mid]!.startSeconds <= time) low = mid + 1;
    else high = mid;
  }
  const previous = sync.ranges[low - 1];
  const next = sync.ranges[low];
  const after = previous
    ? time <= previous.endSeconds
      ? 1
      : 1 - ease((time - previous.endSeconds) / CURSOR_HOVER_EXIT_SECONDS)
    : 0;
  const before = next ? 1 - ease((next.startSeconds - time) / CURSOR_HOVER_ENTER_SECONDS) : 0;
  return 1 - (1 - after) * (1 - before);
}
