const FLOATING_POINT_TOLERANCE = 16;

export function snapTimeToBoundary(time: number, ...boundaries: number[]) {
  if (!Number.isFinite(time)) return time;
  for (const boundary of boundaries) {
    const scale = Math.max(1, Math.abs(time), Math.abs(boundary));
    if (Math.abs(time - boundary) <= Number.EPSILON * scale * FLOATING_POINT_TOLERANCE) return boundary;
  }
  return time;
}
