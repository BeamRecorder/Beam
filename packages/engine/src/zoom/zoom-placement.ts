export interface ZoomPlacementInterval {
  startMs: number;
  endMs: number;
}

export const MIN_ZOOM_PLACEMENT_DURATION_MS = 200;

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function fitZoomPlacement(options: {
  anchorMs: number;
  preferredDurationMs: number;
  timelineDurationMs: number;
  occupied: ReadonlyArray<ZoomPlacementInterval>;
  minimumDurationMs?: number;
}): ZoomPlacementInterval | null {
  if (
    !Number.isFinite(options.anchorMs) ||
    !Number.isFinite(options.preferredDurationMs) ||
    !Number.isFinite(options.timelineDurationMs)
  )
    return null;
  const timelineDurationMs = Math.max(0, Math.round(options.timelineDurationMs));
  if (timelineDurationMs <= 0) return null;
  const requestedMinimumDurationMs = options.minimumDurationMs ?? MIN_ZOOM_PLACEMENT_DURATION_MS;
  if (!Number.isFinite(requestedMinimumDurationMs)) return null;
  const minimumDurationMs = Math.max(1, Math.round(requestedMinimumDurationMs));
  const preferredDurationMs = Math.max(minimumDurationMs, Math.round(options.preferredDurationMs));
  const occupied = options.occupied
    .filter((interval) => Number.isFinite(interval.startMs) && Number.isFinite(interval.endMs))
    .map((interval) => ({
      startMs: clamp(Math.round(interval.startMs), 0, timelineDurationMs),
      endMs: clamp(Math.round(interval.endMs), 0, timelineDurationMs),
    }))
    .filter((interval) => interval.endMs > interval.startMs)
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  const merged: ZoomPlacementInterval[] = [];
  for (const interval of occupied) {
    const previous = merged.at(-1);
    if (previous && interval.startMs <= previous.endMs) previous.endMs = Math.max(previous.endMs, interval.endMs);
    else merged.push({ ...interval });
  }

  const gaps: ZoomPlacementInterval[] = [];
  let cursorMs = 0;
  for (const interval of merged) {
    if (interval.startMs > cursorMs) gaps.push({ startMs: cursorMs, endMs: interval.startMs });
    cursorMs = Math.max(cursorMs, interval.endMs);
  }
  if (cursorMs < timelineDurationMs) gaps.push({ startMs: cursorMs, endMs: timelineDurationMs });

  const anchorMs = clamp(Math.round(options.anchorMs), 0, timelineDurationMs);
  const gap = gaps.find((candidate) => anchorMs >= candidate.startMs && anchorMs <= candidate.endMs);
  if (!gap) return null;
  const availableDurationMs = gap.endMs - gap.startMs;
  if (availableDurationMs < minimumDurationMs) return null;
  const durationMs = Math.min(preferredDurationMs, availableDurationMs);
  const startMs = clamp(Math.round(anchorMs - durationMs / 2), gap.startMs, gap.endMs - durationMs);
  return { startMs, endMs: startMs + durationMs };
}
