/** Directional drop-shadow displacement in reference pixels, independent of blur. */
export function shadowOffset(direction: string | undefined, distance: number | undefined, legacyOffset: number) {
  const diagonal = direction === 'bottom-right' || direction === 'top-left';
  const offset = distance === undefined ? legacyOffset : distance / (diagonal ? Math.SQRT2 : 1);
  if (direction === 'top-left') return { x: -offset, y: -offset };
  if (direction === 'bottom-right') return { x: offset, y: offset };
  if (direction === 'bottom') return { x: 0, y: offset };
  return { x: 0, y: 0 };
}

export function shadowDistance(direction: string | undefined, distance: number | undefined, legacyOffset: number) {
  if (direction === 'all' && distance === undefined) return 0;
  return distance ?? legacyOffset * (direction === 'bottom-right' || direction === 'top-left' ? Math.SQRT2 : 1);
}

export const isShadowDistance = (value: unknown): value is number | undefined =>
  value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 256);
