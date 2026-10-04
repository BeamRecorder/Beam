import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { screenshotExportPreview } from '../screenshot-export-preview';

let surfaces: Array<{ width: number; height: number }>;
const draw = vi.fn();
const encode = vi.fn();
let available = true;
beforeEach(() => {
  surfaces = [];
  available = true;
  draw.mockReset();
  encode.mockReset().mockResolvedValue({ arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer });
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        surfaces.push(this);
      }
      getContext() {
        return available ? { drawImage: draw } : null;
      }
      convertToBlob = encode;
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
it.each([
  [1920, 1080, 184, 104],
  [100, 100, 100, 100],
  [1080, 1920, 59, 104],
])('bounds a %s × %s rendered thumbnail and preserves its alpha', async (width, height, w, h) => {
  const source = { width, height } as OffscreenCanvas;
  await expect(screenshotExportPreview(source)).resolves.toBe('data:image/png;base64,iVBORw==');
  expect(draw).toHaveBeenCalledWith(source, 0, 0, w, h);
  expect(encode).toHaveBeenCalledWith({ type: 'image/png' });
  expect(surfaces[0]).toMatchObject({ width: 0, height: 0 });
});
it('releases its surface when no rendering context is available', async () => {
  available = false;
  await expect(screenshotExportPreview({ width: 100, height: 50 } as OffscreenCanvas)).rejects.toThrow(
    'preview rendering is unavailable',
  );
  expect(surfaces[0]).toMatchObject({ width: 0, height: 0 });
});
it('releases its surface after encoding fails', async () => {
  encode.mockRejectedValueOnce(new Error('encoding failed'));
  await expect(screenshotExportPreview({ width: 100, height: 50 } as OffscreenCanvas)).rejects.toThrow(
    'encoding failed',
  );
  expect(surfaces[0]).toMatchObject({ width: 0, height: 0 });
});
