import { expect, it } from 'vitest';
import { cursorRasterBounds, cursorStampResolution, MAX_CURSOR_RASTER_PIXELS } from './cursor-raster-bounds';
import type { CursorGpuOptions } from './cursor-gpu-types';

const options = (patch: Partial<CursorGpuOptions> = {}): CursorGpuOptions => ({
  image: {} as ImageBitmap,
  geometry: { width: 32, height: 32, hotspot: { x: 4, y: 4 } },
  samples: [{ x: 10, y: 10, weight: 1 }],
  shadow: { enabled: true, blur: 4, color: '#000', direction: 'bottom' },
  resolution: 1,
  ...patch,
});
it('preserves the exact logical extent and raster grid of the original GPU renderer', () => {
  expect(cursorRasterBounds(options(), 4096)).toEqual({
    x: -8,
    y: -8,
    width: 60,
    height: 60,
    pixelWidth: 60,
    pixelHeight: 60,
    resolution: 1,
    weight: 1,
  });
  const bounds = cursorRasterBounds(
    options({
      resolution: 2,
      samples: [
        { x: 10, y: 10, weight: 2 },
        { x: 20, y: 5, weight: 3 },
      ],
    }),
    4096,
  );
  expect(bounds).toEqual({
    x: -8,
    y: -13,
    width: 70,
    height: 65,
    pixelWidth: 140,
    pixelHeight: 130,
    resolution: 2,
    weight: 5,
  });
});
it('bounds all shutter samples, geometry and padding across arbitrary fractional translations', () => {
  for (let frame = 0; frame < 1000; frame++) {
    const x = frame / 13,
      y = -frame / 17;
    const input = options({
      resolution: 0.75 + (frame % 8),
      samples: [
        { x, y, weight: 1 },
        { x: x + 0.37, y: y - 12.2, weight: 0 },
      ],
    });
    const result = cursorRasterBounds(input, 4096);
    expect(result.pixelWidth).toBe(Math.ceil(result.width * result.resolution));
    expect(result.pixelHeight).toBe(Math.ceil(result.height * result.resolution));
    expect(result.x).toBeCloseTo(x - 18);
    expect(result.y).toBeCloseTo(y - 12.2 - 18);
    expect(result.pixelWidth * result.pixelHeight).toBeLessThanOrEqual(MAX_CURSOR_RASTER_PIXELS);
  }
});
it('retains volume padding, the physical resolution cap and exact memory/device boundaries', () => {
  const volume = cursorRasterBounds(options({ volume: { pitch: 0.9, yaw: -0.9, height: 1 }, resolution: 8 }), 4096);
  expect(volume.resolution).toBe(4);
  expect(volume.width).toBeCloseTo(107.2);
  const exact = options({
    geometry: { width: 2044, height: 2044, hotspot: { x: 0, y: 0 } },
    shadow: { enabled: false, blur: 0, color: '#000', direction: 'bottom' },
  });
  expect(cursorRasterBounds(exact, 2048).pixelWidth).toBe(2048);
  expect(() => cursorRasterBounds(exact, 2047)).toThrow('bounded');
});
it.each([
  { samples: [] },
  { samples: Array(17).fill({ x: 0, y: 0, weight: 1 }) },
  { samples: [{ x: NaN, y: 0, weight: 1 }] },
  { samples: [{ x: 0, y: Infinity, weight: 1 }] },
  { samples: [{ x: 0, y: 0, weight: -1 }] },
  { samples: [{ x: 0, y: 0, weight: 0 }] },
  {
    samples: [
      { x: 0, y: 0, weight: 1e308 },
      { x: 1, y: 1, weight: 1e308 },
    ],
  },
  { samples: [{ x: 1e308, y: 1e308, weight: 1 }] },
  {
    samples: [
      { x: -1e308, y: 0, weight: 1 },
      { x: 1e308, y: 0, weight: 1 },
    ],
  },
  { geometry: { width: 0, height: 1, hotspot: { x: 0, y: 0 } } },
  { geometry: { width: 1, height: -1, hotspot: { x: 0, y: 0 } } },
  { geometry: { width: 2100, height: 2100, hotspot: { x: 0, y: 0 } } },
  { geometry: { width: 4096, height: 1, hotspot: { x: 0, y: 0 } } },
  { geometry: { width: 1, height: 1, hotspot: { x: NaN, y: 0 } } },
  { resolution: 0 },
  { resolution: Infinity },
  {
    shadow: {
      enabled: true,
      blur: -1,
      color: '#000',
      direction: 'bottom' as const,
    },
  },
  { volume: { pitch: NaN, yaw: 0, height: 0 } },
  { volume: { pitch: 0.91, yaw: 0, height: 0 } },
  { volume: { pitch: 0, yaw: -0.91, height: 0 } },
  { volume: { pitch: 0, yaw: 0, height: -1 } },
  { volume: { pitch: 0, yaw: 0, height: 2 } },
])('rejects unsafe exposure before allocating artwork %o', (patch) => {
  expect(() => cursorRasterBounds(options(patch), 4096)).toThrow(RangeError);
});
it.each([NaN, Infinity, 0, -1, 1.5])('rejects an invalid device limit %s', (max) => {
  expect(() => cursorRasterBounds(options(), max)).toThrow(RangeError);
});
it.each([0, 0.5, -1, NaN, 3])('rejects an unsupported internal density %s', (density) => {
  expect(() => cursorRasterBounds(options(), 4096, density)).toThrow(RangeError);
});
it('plans stable supersampling bands while retaining at least the authored density', () => {
  for (const [requested, expected] of [
    [0.25, 1],
    [1, 2],
    [1.01, 4],
    [1.99, 4],
    [2.01, 8],
    [4, 8],
  ])
    expect(cursorStampResolution(60, 60, requested!, 4096)).toBe(expected);
});
it('respects exact memory and non-power-of-two device limits without lowering authored quality', () => {
  expect(cursorStampResolution(1500, 1000, 1, 4096)).toBe(1);
  expect(cursorStampResolution(500, 500, 4, 4096)).toBe(4);
  expect(cursorStampResolution(900, 900, 2.1, 4096)).toBe(2.1);
  expect(cursorStampResolution(60, 60, 1, 65)).toBe(1);
  expect(cursorStampResolution(1e308, 1, 1e-308, 4096)).toBe(1e-308);
});
it.each([
  [0, 1, 1, 4096],
  [1, Infinity, 1, 4096],
  [1, 1, 0, 4096],
  [1, 1, 4.1, 4096],
  [1, 1, 1, NaN],
  [1, 1, 1, 0],
  [100, 100, 1, 99],
])('rejects an invalid stamp plan %s × %s at %s with limit %s', (width, height, resolution, maxSize) => {
  expect(() => cursorStampResolution(width, height, resolution, maxSize)).toThrow(RangeError);
});
