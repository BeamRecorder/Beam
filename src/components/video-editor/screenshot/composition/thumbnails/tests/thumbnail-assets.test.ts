import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createThumbnailImageLoader } from '../thumbnail-assets';

const makeBitmap = (width: number, height: number) => ({ width, height, close: vi.fn() }) as unknown as ImageBitmap;
let fetchMock: ReturnType<typeof vi.fn>;
let bitmapFactory: ReturnType<typeof vi.fn>;
let bitmaps: ImageBitmap[];

beforeEach(() => {
  bitmaps = [];
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(['image']) }));
  bitmapFactory = vi.fn(async () => {
    const bitmap = makeBitmap(320, 180);
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
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(bitmapFactory).toHaveBeenCalledOnce();
    expect((first as unknown as { close: ReturnType<typeof vi.fn> }).close).not.toHaveBeenCalled();
  });

  it('keeps the three most-recent decoded images and closes an evicted bitmap', async () => {
    const load = createThumbnailImageLoader();
    const a = await load('a.png');
    const b = await load('b.png');
    const c = await load('c.png');
    await load('a.png'); // Make b the least-recently used image.
    await load('d.png');

    expect((b as unknown as { close: ReturnType<typeof vi.fn> }).close).toHaveBeenCalledOnce();
    expect((a as unknown as { close: ReturnType<typeof vi.fn> }).close).not.toHaveBeenCalled();
    expect((c as unknown as { close: ReturnType<typeof vi.fn> }).close).not.toHaveBeenCalled();
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
    expect(recovered).toBe(bitmaps[0]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bitmapFactory).toHaveBeenCalledOnce();
  });

  it('does not cache a bitmap decode failure', async () => {
    bitmapFactory.mockRejectedValueOnce(new Error('invalid image bytes'));
    const load = createThumbnailImageLoader();

    await expect(load('retry.png')).rejects.toThrow('invalid image bytes');
    const recovered = await load('retry.png');
    expect(recovered).toBe(bitmaps[0]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bitmapFactory).toHaveBeenCalledTimes(2);
  });
});
