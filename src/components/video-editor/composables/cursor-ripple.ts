export const CURSOR_RIPPLE_DURATION_SECONDS = 0.5;

export interface CursorRippleSample {
  radius: number;
  opacity: number;
}

export function cursorRippleAt(ageSeconds: number, rippleSize: number): CursorRippleSample | null {
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > CURSOR_RIPPLE_DURATION_SECONDS) return null;
  const progress = Math.min(1, ageSeconds / CURSOR_RIPPLE_DURATION_SECONDS);
  const easeOut = 1 - (1 - progress) ** 3;
  return {
    radius: 2 + Math.max(0, rippleSize) * easeOut,
    opacity: 1 - progress,
  };
}
