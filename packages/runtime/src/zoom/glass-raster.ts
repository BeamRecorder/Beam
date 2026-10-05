/** Bound retained lens surfaces to 64 MiB and a portable 4096 px texture edge. */
export function glassRasterSize(width: number, height: number, density: number) {
  if (![width, height, density].every(Number.isFinite) || width <= 0 || height <= 0 || density < 0)
    throw new RangeError('Invalid glass raster dimensions or density.');
  const scale = Math.min(Math.max(1, Math.ceil(density)), 4096 / Math.max(width, height));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}
