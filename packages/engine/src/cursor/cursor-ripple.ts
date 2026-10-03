export const CURSOR_RIPPLE_DURATION_SECONDS = 0.5;

export type CursorRippleStyle = 'none' | 'single' | 'double' | 'solid';

export interface CursorRippleRing {
  radius: number;
  opacity: number;
  filled?: boolean;
}

export interface CursorRippleSample {
  radius: number;
  opacity: number;
  rings: CursorRippleRing[];
}

export function cursorRippleAt(
  ageSeconds: number,
  rippleSize: number,
  style: CursorRippleStyle = 'single',
): CursorRippleSample | null {
  if (
    style === 'none' ||
    !Number.isFinite(ageSeconds) ||
    ageSeconds < 0 ||
    ageSeconds > CURSOR_RIPPLE_DURATION_SECONDS
  ) {
    return null;
  }

  const progress = Math.min(1, ageSeconds / CURSOR_RIPPLE_DURATION_SECONDS);
  const easeOut = 1 - (1 - progress) ** 3;
  const baseRadius = 2 + Math.max(0, rippleSize) * easeOut;
  const baseOpacity = Math.max(0, 1 - progress);

  const rings: CursorRippleRing[] = [];

  if (style === 'single') {
    rings.push({ radius: baseRadius, opacity: baseOpacity, filled: false });
  } else if (style === 'double') {
    // Primary outer ring
    rings.push({ radius: baseRadius, opacity: baseOpacity, filled: false });

    // Staggered secondary ring
    const delay = 0.09;
    if (ageSeconds >= delay) {
      const p2 = Math.min(1, (ageSeconds - delay) / (CURSOR_RIPPLE_DURATION_SECONDS - delay));
      const ease2 = 1 - (1 - p2) ** 3;
      rings.push({
        radius: 2 + Math.max(0, rippleSize * 0.72) * ease2,
        opacity: Math.max(0, (1 - p2) * 0.85),
        filled: false,
      });
    }
  } else if (style === 'solid') {
    // Expanding outline ring
    rings.push({ radius: baseRadius, opacity: baseOpacity, filled: false });

    // Inner glowing core
    const coreProgress = Math.min(1, ageSeconds / 0.32);
    const coreRadius = Math.max(0, rippleSize * 0.45 * (1 - coreProgress * 0.4));
    const coreOpacity = Math.max(0, (1 - coreProgress) * 0.55);
    if (coreRadius > 0 && coreOpacity > 0) {
      rings.push({
        radius: coreRadius,
        opacity: coreOpacity,
        filled: true,
      });
    }
  }

  return {
    radius: baseRadius,
    opacity: baseOpacity,
    rings,
  };
}
