import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bitmap, requestFixture } from './export-test-support';
const raster = vi.hoisted(() => ({ scale: 1 }));
vi.mock('../screenshot-export-raster', () => ({ screenshotExportRasterScale: () => raster.scale }));
import { createScreenshotExportImages } from '../screenshot-export-images';

let fetchImage: ReturnType<typeof vi.fn>;
let decode: ReturnType<typeof vi.fn>;
let decoded: ImageBitmap[];
beforeEach(() => {
  raster.scale = 1;
  decoded = [];
  fetchImage = vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(['image']) }));
  decode = vi.fn(async () => {
    const next = bitmap();
    decoded.push(next);
    return next;
  });
  vi.stubGlobal('fetch', fetchImage);
  vi.stubGlobal('createImageBitmap', decode);
});
afterEach(() => vi.unstubAllGlobals());
it('loads intrinsic dimensions and releases its original raster when the job ends', async () => {
  const loader = createScreenshotExportImages(requestFixture());
  const assets = await loader.assets();
  expect(assets).toMatchObject({
    width: 1000,
    height: 500,
    rasterSize: { width: 1000, height: 500 },
    logo: null,
    background: null,
  });
  expect(decoded[0]!.close).not.toHaveBeenCalled();
  await loader.dispose();
  await loader.dispose();
  expect(decoded[0]!.close).toHaveBeenCalledOnce();
});
it('decodes shared photos once and skips disabled imported layers', async () => {
  const request = requestFixture();
  request.state.images = [0, 1, 2].map((index) => ({
    ...request.state.image,
    kind: 'image' as const,
    id: String(index),
    width: 1000,
    height: 500,
    source: index === 2 ? 'disabled' : 'shared',
    enabled: index !== 2,
  }));
  const loader = createScreenshotExportImages(request);
  const assets = await loader.assets();
  expect(fetchImage).toHaveBeenCalledTimes(2);
  expect(assets.images!.get('0')).toBe(assets.images!.get('1'));
  expect(assets.images!.has('2')).toBe(false);
  await loader.dispose();
  expect(decoded.every((image) => vi.mocked(image.close).mock.calls.length === 1)).toBe(true);
});
it('never runs more than two original image decodes at once', async () => {
  let active = 0,
    maximum = 0;
  decode.mockImplementation(async () => {
    maximum = Math.max(maximum, ++active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    const next = bitmap();
    decoded.push(next);
    return next;
  });
  const request = requestFixture();
  request.state.images = Array.from({ length: 7 }, (_, index) => ({
    ...request.state.image,
    kind: 'image' as const,
    id: String(index),
    source: `photo-${index}`,
    width: 1000,
    height: 500,
  }));
  const loader = createScreenshotExportImages(request);
  await loader.assets();
  expect(maximum).toBe(2);
  expect(fetchImage).toHaveBeenCalledTimes(8);
  await loader.dispose();
});
it('downsamples only oversized rasters with high quality and retains intrinsic crop dimensions', async () => {
  raster.scale = 0.25;
  const original = bitmap(6000, 3000),
    resized = bitmap(1500, 750);
  decode.mockResolvedValueOnce(original).mockResolvedValueOnce(resized);
  const loader = createScreenshotExportImages(requestFixture());
  const assets = await loader.assets();
  expect(decode).toHaveBeenLastCalledWith(original, { resizeWidth: 1500, resizeHeight: 750, resizeQuality: 'high' });
  expect(assets).toMatchObject({ image: resized, width: 6000, height: 3000, rasterSize: { width: 1500, height: 750 } });
  expect(original.close).toHaveBeenCalledOnce();
  await loader.dispose();
  expect(original.close).toHaveBeenCalledOnce();
  expect(resized.close).toHaveBeenCalledOnce();
});
it('releases the original if bitmap resizing fails', async () => {
  raster.scale = 0.25;
  const original = bitmap();
  decode.mockResolvedValueOnce(original).mockRejectedValueOnce(new Error('resize failed'));
  const loader = createScreenshotExportImages(requestFixture());
  await expect(loader.assets()).rejects.toThrow('resize failed');
  await loader.dispose();
  expect(original.close).toHaveBeenCalledOnce();
});
it('drains late decodes and closes all their rasters after a failed HTTP response', async () => {
  const request = requestFixture();
  request.state.images = [0, 1, 2].map((index) => ({
    ...request.state.image,
    kind: 'image' as const,
    id: String(index),
    source: `photo-${index}`,
    width: 1000,
    height: 500,
  }));
  fetchImage.mockResolvedValueOnce({ ok: false, status: 403 });
  const loader = createScreenshotExportImages(request);
  await expect(loader.assets()).rejects.toThrow('Screenshot image unavailable (403).');
  await loader.dispose();
  expect(fetchImage).toHaveBeenCalledTimes(4);
  expect(decoded).toHaveLength(3);
  expect(decoded.every((image) => vi.mocked(image.close).mock.calls.length === 1)).toBe(true);
});
it('rejects video backgrounds before fetching and allows no fabricated bitmap', async () => {
  const request = requestFixture();
  request.state.canvas.showBackground = true;
  request.state.background = { kind: 'video', id: 'video', name: 'Video', path: 'video.mp4', extension: 'mp4' };
  const loader = createScreenshotExportImages(request);
  await expect(loader.assets()).rejects.toThrow('Screenshot backgrounds must be still images.');
  await loader.dispose();
  expect(fetchImage).not.toHaveBeenCalled();
});
it('loads a still background independently and reports a decode failure', async () => {
  const request = requestFixture();
  request.state.canvas.showBackground = true;
  request.state.background = { kind: 'image', id: 'back', name: 'Back', path: 'back.webp', extension: 'webp' };
  const loader = createScreenshotExportImages(request);
  const assets = await loader.assets();
  expect(assets.background).toBe(decoded[1]);
  await loader.dispose();
  decode.mockRejectedValueOnce(new Error('decode failed'));
  const failing = createScreenshotExportImages(request);
  await expect(failing.assets()).rejects.toThrow('decode failed');
  await failing.dispose();
});
