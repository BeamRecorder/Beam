export const DURATION_MS = 15_000;
export const BEAT_SECONDS = 15 / 32;

export function compositionTime(timeMs: number): number {
  if (!Number.isFinite(timeMs)) throw new RangeError('The composition clock must be finite.');
  return Math.min(DURATION_MS, Math.max(0, timeMs)) / 1000;
}
