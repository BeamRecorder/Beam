export const durationSeconds = 7;
export const stillTimeMs = 2400;
export const fps = 60;

export function seekSeconds(timeMs: number): number {
  if (!Number.isFinite(timeMs)) throw new RangeError('Seek time must be finite');
  return Math.max(0, Math.min(durationSeconds, timeMs / 1000));
}
export function frameNumber(timeMs: number): number {
  return Math.floor(seekSeconds(timeMs) * fps);
}
export function timecode(timeMs: number): string {
  const centiseconds = Math.round(seekSeconds(timeMs) * 100);
  const seconds = String(Math.floor(centiseconds / 100)).padStart(2, '0');
  return `00:${seconds}.${String(centiseconds % 100).padStart(2, '0')}`;
}
