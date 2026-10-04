import { describe, expect, it } from 'vitest';
import { sampleCanvasControlTone } from './canvas-control-contrast';
const pixels = (value: number, alpha = 255) => ({
  width: 5,
  height: 5,
  data: new Uint8ClampedArray(Array.from({ length: 25 }, () => [value, value, value, alpha]).flat()),
});
describe('canvas control local contrast', () => {
  it.each([0, 20, 100, 117])('chooses light handles over dark pixels %s', (value) => {
    expect(sampleCanvasControlTone(pixels(value), 0.5, 0.5)).toBe('light');
  });
  it.each([118, 128, 200, 255])('chooses dark handles over bright pixels %s', (value) => {
    expect(sampleCanvasControlTone(pixels(value), 0.5, 0.5)).toBe('dark');
  });
  it('averages the local neighbourhood instead of reacting to one pixel', () => {
    const image = pixels(255);
    image.data.set([0, 0, 0, 255], 12 * 4);
    expect(sampleCanvasControlTone(image, 0.5, 0.5)).toBe('dark');
    expect(sampleCanvasControlTone(pixels(0), 0, 0)).toBe('light');
    expect(sampleCanvasControlTone(pixels(255), 1, 1)).toBe('dark');
  });
  it('ignores transparent pixels and uses perceived colour luminance', () => {
    expect(sampleCanvasControlTone(pixels(255, 0), 0.5, 0.5)).toBeNull();
    const image = pixels(0, 0);
    image.data.set([0, 255, 0, 255], 12 * 4);
    expect(sampleCanvasControlTone(image, 0.5, 0.5)).toBe('dark');
    image.data.set([0, 0, 255, 255], 12 * 4);
    expect(sampleCanvasControlTone(image, 0.5, 0.5)).toBe('light');
  });
  it.each([-1, 1.1, NaN, Infinity])('ignores out-of-frame or invalid coordinates %s', (value) => {
    expect(sampleCanvasControlTone(pixels(255), value, 0.5)).toBeNull();
    expect(sampleCanvasControlTone(pixels(255), 0.5, value)).toBeNull();
  });
  it('does not invent colours for an incomplete bitmap', () => {
    expect(sampleCanvasControlTone({ width: 0, height: 5, data: [] }, 0, 0)).toBeNull();
    expect(sampleCanvasControlTone({ width: 5, height: 0, data: [] }, 0, 0)).toBeNull();
    expect(sampleCanvasControlTone({ width: 5, height: 5, data: [] }, 0, 0)).toBeNull();
  });
});
