/** Transport timecodes use frame numbers, avoiding millisecond rounding across seeks. */
export function frameTimecode(milliseconds: number, fps: number, denominator = 1): string {
  const numerator = Math.max(1, Math.round(fps)), divisor = Math.max(1, Math.round(denominator));
  const nominal = Math.max(1, Math.ceil(numerator / divisor));
  // Transport reports milliseconds. Accept its one-time rounding without accumulating steps.
  const frame = Math.max(0, Math.floor((milliseconds + 0.5) * numerator / (1000 * divisor)));
  const seconds = Math.floor(frame / nominal);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60, frame % nominal]
    .map(value => String(value).padStart(2, '0')).join(':');
}
/** Reject malformed or impossible frame positions before they reach the actor. */
export function parseTimecode(value: string, fps: number, denominator = 1): number | undefined {
  if (!/^\d{2,}:\d{2}:\d{2}:\d{2,}$/.test(value)) return undefined;
  const [hour, minute, second, frame] = value.split(':').map(Number);
  const numerator = Math.max(1, Math.round(fps)), divisor = Math.max(1, Math.round(denominator));
  const nominal = Math.max(1, Math.ceil(numerator / divisor));
  const frames = (hour * 3600 + minute * 60 + second) * nominal + frame;
  if (minute >= 60 || second >= 60 || frame >= nominal || !Number.isSafeInteger(frames)) return undefined;
  return frames * 1000 * divisor / numerator;
}

/** Each step computes an absolute frame address; it never adds a rounded duration. */
export function stepFrame(milliseconds:number, delta:number, numerator:number, denominator=1):number {
  const frame = Math.round(milliseconds*numerator/(1000*denominator));
  return Math.max(0,frame+delta)*1000*denominator/numerator;
}
