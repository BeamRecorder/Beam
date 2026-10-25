/** Geometry is in layout pixels, never the CSS-scaled screenshot coordinates. */
export function timelineCanvasSpan(startMs: number, durationMs: number, duration: number, width: number, left: number) {
  if (![startMs, durationMs, duration, width, left].every(Number.isFinite) || duration <= 0 || width <= 0)
    throw new RangeError('Invalid timeline canvas geometry.');
  return {
    x: (startMs / duration) * width - left,
    width: Math.max(14, (durationMs / duration) * width),
  };
}

/** 12px icons, 3px between them, then room for both badge padding and a visible gap. */
export const timelineMetadataInset = (count: number) => (count > 0 ? count * 15 + 6 : 0);
