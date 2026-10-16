import type { CursorGpuOptions, CursorRasterBounds } from './cursor-gpu-types';

export const MAX_CURSOR_RASTER_PIXELS = 4 * 1024 * 1024;

/** Both renderers preserve the same raster grid, shutter weights and bounded exposure extent. */
export function cursorRasterBounds(options: CursorGpuOptions, maxSize: number, density = 1): CursorRasterBounds {
  const { geometry, samples } = options;
  if (
    !Number.isSafeInteger(maxSize) ||
    maxSize < 1 ||
    (density !== 1 && density !== 2) ||
    !samples.length ||
    samples.length > 16 ||
    samples.some((sample) => ![sample.x, sample.y, sample.weight].every(Number.isFinite) || sample.weight < 0) ||
    ![
      geometry.width,
      geometry.height,
      geometry.hotspot.x,
      geometry.hotspot.y,
      options.resolution,
      options.shadow.blur,
    ].every(Number.isFinite) ||
    geometry.width <= 0 ||
    geometry.height <= 0 ||
    options.resolution <= 0 ||
    options.shadow.blur < 0
  )
    throw new RangeError('Invalid cursor rendering geometry.');
  const weight = samples.reduce((sum, sample) => sum + sample.weight, 0);
  if (!(weight > 0) || !Number.isFinite(weight)) throw new RangeError('Cursor blur has no finite exposure weight.');
  const pose = options.volume;
  if (
    pose &&
    (![pose.pitch, pose.yaw, pose.height].every(Number.isFinite) ||
      Math.abs(pose.pitch) > 0.9 ||
      Math.abs(pose.yaw) > 0.9 ||
      pose.height < 0 ||
      pose.height > 1)
  )
    throw new RangeError('Invalid cursor volume pose.');
  const pad = (pose ? Math.max(geometry.width, geometry.height) * 0.8 : 2) + options.shadow.blur * 3;
  const x = Math.min(...samples.map((sample) => sample.x)) - geometry.hotspot.x - pad;
  const y = Math.min(...samples.map((sample) => sample.y)) - geometry.hotspot.y - pad;
  const width = Math.max(...samples.map((sample) => sample.x)) + geometry.width - geometry.hotspot.x + pad - x;
  const height = Math.max(...samples.map((sample) => sample.y)) + geometry.height - geometry.hotspot.y + pad - y;
  const resolution = Math.min(4, options.resolution) * density;
  const pixelWidth = Math.max(1, Math.ceil(width * resolution));
  const pixelHeight = Math.max(1, Math.ceil(height * resolution));
  if (
    ![width, height, pixelWidth, pixelHeight].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    pixelWidth > maxSize ||
    pixelHeight > maxSize ||
    pixelWidth * pixelHeight > MAX_CURSOR_RASTER_PIXELS
  )
    throw new RangeError('Cursor GPU surface exceeds its bounded output size.');
  return { x, y, width, height, pixelWidth, pixelHeight, resolution, weight };
}

/** Keep supersampled stamps stable during zooms, within the existing surface and device limits. */
export function cursorStampResolution(width: number, height: number, resolution: number, maxSize: number): number {
  if (
    ![width, height, resolution].every((value) => Number.isFinite(value) && value > 0) ||
    resolution > 4 ||
    !Number.isSafeInteger(maxSize) ||
    maxSize < 1
  )
    throw new RangeError('Invalid cursor stamp dimensions.');
  const fits = (scale: number) => {
    const w = Math.max(1, Math.ceil(width * scale)),
      h = Math.max(1, Math.ceil(height * scale));
    return w <= maxSize && h <= maxSize && w * h <= MAX_CURSOR_RASTER_PIXELS;
  };
  if (!fits(resolution)) throw new RangeError('Cursor stamp exceeds its bounded output size.');
  for (
    let scale = 2 ** Math.ceil(Math.log2(Math.max(1, resolution * 2)));
    scale >= 1 && scale >= resolution;
    scale /= 2
  )
    if (fits(scale)) return scale;
  return resolution;
}
