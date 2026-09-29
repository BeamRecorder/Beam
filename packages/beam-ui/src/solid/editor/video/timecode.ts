/** Transport timecodes use frame numbers, avoiding millisecond rounding across seeks. */
export function frameTimecode(milliseconds: number, fps: number): string {
  const rate = Math.max(1, Math.round(fps));
  const frame = Math.max(0, Math.floor(milliseconds * rate / 1000 + 0.0001));
  const seconds = Math.floor(frame / rate);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60, frame % rate]
    .map(value => String(value).padStart(2, '0')).join(':');
}
/** Reject malformed or impossible frame positions before they reach the actor. */
export function parseTimecode(value: string, fps: number): number | undefined {
  if (!/^\d{2,}:\d{2}:\d{2}:\d{2,}$/.test(value)) return undefined;
  const [hour, minute, second, frame] = value.split(':').map(Number);
  const rate = Math.max(1, Math.round(fps));
  if (minute >= 60 || second >= 60 || frame >= rate) return undefined;
  return ((hour * 3600 + minute * 60 + second) + frame / rate) * 1000;
}
