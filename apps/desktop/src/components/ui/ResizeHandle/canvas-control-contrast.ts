import type { CanvasControlPixels, CanvasControlTone } from './canvas-control-contrast-types';
const linear = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

/** One average for the complete selection, including anchors on contrasting artwork. */
export function sampleCanvasControlsTone(
  image: CanvasControlPixels,
  points: readonly { x: number; y: number }[],
): CanvasControlTone | null {
  if (image.width < 1 || image.height < 1 || image.data.length < image.width * image.height * 4) return null;
  const samples = new Set<number>();
  for (const { x, y } of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) continue;
    const cx = Math.min(image.width - 1, Math.floor(x * image.width));
    const cy = Math.min(image.height - 1, Math.floor(y * image.height));
    for (let row = Math.max(0, cy - 1); row <= Math.min(image.height - 1, cy + 1); row++)
      for (let col = Math.max(0, cx - 1); col <= Math.min(image.width - 1, cx + 1); col++)
        samples.add((row * image.width + col) * 4);
  }
  let luminance = 0,
    weight = 0;
  for (const i of samples) {
    const alpha = image.data[i + 3]! / 255;
    luminance +=
      (0.2126 * linear(image.data[i]! / 255) +
        0.7152 * linear(image.data[i + 1]! / 255) +
        0.0722 * linear(image.data[i + 2]! / 255)) *
      alpha;
    weight += alpha;
  }
  if (!weight) return null;
  return luminance / weight > 0.1791287847 ? 'dark' : 'light';
}

export function sampleCanvasControlTone(image: CanvasControlPixels, x: number, y: number): CanvasControlTone | null {
  return sampleCanvasControlsTone(image, [{ x, y }]);
}
