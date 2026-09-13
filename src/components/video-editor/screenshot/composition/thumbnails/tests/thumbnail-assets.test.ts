import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createThumbnailImageLoader } from '../thumbnail-assets';

const makeBitmap = (width: number, height: number) => ({ width, height, close: vi.fn() }) as unknown as ImageBitmap;
let fetchMock: ReturnType<typeof vi.fn>;
let bitmapFactory: ReturnType<typeof vi.fn>;
let bitmaps: ImageBitmap[];
let queuedBitmaps: ImageBitmap[];

beforeEach(() => {
  bitmaps = [];
  queuedBitmaps = [];
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(['image']) }));
  bitmapFactory = vi.fn(async () => {
    const bitmap = queuedBitmaps.shift() ?? makeBitmap(320, 180);
    bitmaps.push(bitmap);
    return bitmap;
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('createImageBitmap', bitmapFactory);
});

afterEach(() => vi.unstubAllGlobals());

describe('thumbnail asset image cache', () => {
  it('decodes once per URL and refreshes the URL on cache access', async () => {
    const load = createThumbnailImageLoader();
    const first = await load('project-media://one.png');
    const second = await load('project-media://one.png');

    expect(second).toBe(first);
    expect(first).toMatchObject({ width: 320, height: 180, image: bitmaps[0] });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(bitmapFactory).toHaveBeenCalledOnce();
    expect((first.image as unknown as { close: ReturnType<typeof vi.fn> }).close).not.toHaveBeenCalled();
  });

  it('downsamples oversized sources to a 512px longest edge and retains their intrinsic dimensions', async () => {
    const source = makeBitmap(2_048, 1_024);
    const thumbnail = makeBitmap(512, 256);
    queuedBitmaps.push(source, thumbnail);
    const load = createThumbnailImageLoader();

    const asset = await load('large.png');

    expect(bitmapFactory).toHaveBeenNthCalledWith(1, expect.any(Blob));
    expect(bitmapFactory).toHaveBeenNthCalledWith(2, source, {
      resizeWidth: 512,
      resizeHeight: 256,
      resizeQuality: 'high',
    });
    expect(asset).toEqual({ image: thumbnail, width: 2_048, height: 1_024 });
    expect(source.close).toHaveBeenCalledOnce();
    expect(thumbnail.close).not.toHaveBeenCalled();
  });

  it('does not resize sources at the longest-edge limit', async () => {
    const source = makeBitmap(511, 512);
    queuedBitmaps.push(source);
    const load = createThumbnailImageLoader();

    const asset = await load('at-limit.png');

    expect(asset).toEqual({ image: source, width: 511, height: 512 });
    expect(bitmapFactory).toHaveBeenCalledOnce();
    expect(source.close).not.toHaveBeenCalled();
  });

  it('keeps the three most-recent decoded images and closes an evicted raster only', async () => {
    const load = createThumbnailImageLoader();
    const a = await load('a.png');
    const b = await load('b.png');
    const c = await load('c.png');
    await load('a.png'); // Make b the least-recently used image.
    await load('d.png');

    expect(b.image.close).toHaveBeenCalledOnce();
    expect(a.image.close).not.toHaveBeenCalled();
    expect(c.image.close).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(bitmaps).toHaveLength(4);
  });

  it('reports non-success responses without trying to decode them and allows a retry', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503, blob: vi.fn() })
      .mockResolvedValueOnce({ ok: true, status: 200, blob: async () => new Blob(['recovered']) });
    const load = createThumbnailImageLoader();

    await expect(load('broken.png')).rejects.toThrow('Unable to load thumbnail image (503).');
    const recovered = await load('broken.png');

    expect(recovered).toEqual({ image: bitmaps[0], width: 320, height: 180 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bitmapFactory).toHaveBeenCalledOnce();
  });

  it('does not cache a bitmap decode failure', async () => {
    bitmapFactory.mockRejectedValueOnce(new Error('invalid image bytes'));
    const load = createThumbnailImageLoader();

    await expect(load('retry.png')).rejects.toThrow('invalid image bytes');
    const recovered = await load('retry.png');

    expect(recovered).toEqual({ image: bitmaps[0], width: 320, height: 180 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bitmapFactory).toHaveBeenCalledTimes(2);
  });

  it('closes the full-size source when thumbnail resizing fails and permits retry', async () => {
    const source = makeBitmap(1_024, 768);
    bitmapFactory.mockImplementationOnce(async () => {
      bitmaps.push(source);
      return source;
    });
    bitmapFactory.mockRejectedValueOnce(new Error('resize failed'));
    const load = createThumbnailImageLoader();

    await expect(load('resize-retry.png')).rejects.toThrow('resize failed');
    expect(source.close).toHaveBeenCalledOnce();
    const recovered = await load('resize-retry.png');

    expect(recovered).toMatchObject({ width: 320, height: 180 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
