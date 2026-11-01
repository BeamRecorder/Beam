import { expect, it } from 'vitest';
import { createStillDocument, validateStillDocument } from './still-document';
import { moveScreenshotCrop, screenshotImageFraming } from './screenshot-geometry';
import { cropPixels } from '../layout/crop/crop-pixels';
import { clampNormalizedCrop } from '../shared/normalized-crop';

it('renders an authored one-pixel crop without silently expanding it to 5%', () => {
  const document = createStillDocument('crop', 'source.png', 2000, 1000);
  document.state.image.crop = { x: 0.1, y: 0.2, width: 1 / 2000, height: 1 / 1000 };
  expect(() => validateStillDocument(document)).not.toThrow();
  expect(screenshotImageFraming(document.state, 2000, 1000, 800, 400).sourceRect).toEqual({
    x: 200,
    y: 200,
    width: 1,
    height: 1,
  });
});
it.each(['top-left', 'bottom-right', 'left', 'bottom'] as const)(
  'snaps %s handles to source pixels, including one-pixel crops',
  (corner) => {
    const size = { width: 2000, height: 1000 },
      initial = { x: 0.1, y: 0.2, width: 0.5, height: 0.5 };
    for (const delta of [-20, 20, 0.0173]) {
      const next = moveScreenshotCrop(initial, delta, delta, corner, size),
        pixels = cropPixels(next, size);
      expect(pixels.width).toBeGreaterThanOrEqual(1);
      expect(pixels.height).toBeGreaterThanOrEqual(1);
      expect(next.x * size.width).toBeCloseTo(pixels.left, 10);
      expect(next.y * size.height).toBeCloseTo(pixels.top, 10);
    }
  },
);
it('moves small crops within the source without enlarging them and retains unknown-size bounds', () => {
  const initial = { x: 0.1, y: 0.2, width: 0.01, height: 0.01 },
    size = { width: 2000, height: 1000 };
  expect(moveScreenshotCrop(initial, 2, 2, undefined, size)).toEqual({ x: 0.99, y: 0.99, width: 0.01, height: 0.01 });
  expect(clampNormalizedCrop(initial).width).toBe(0.05);
  expect(clampNormalizedCrop({ ...initial, width: 0, height: 0 }, size)).toMatchObject({
    width: 1 / 2000,
    height: 1 / 1000,
  });
});
