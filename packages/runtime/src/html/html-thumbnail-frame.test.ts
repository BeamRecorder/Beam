import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHtmlThumbnail } from './html-thumbnail-frame';
import type { HtmlThumbnailRequest } from './html-thumbnail-types';
const request: HtmlThumbnailRequest = {
  id: 1,
  url: 'http://127.0.0.1:10/frame/' + 'f'.repeat(64),
  timeMs: 1000,
  width: 240,
  height: 135,
};
afterEach(() => vi.unstubAllGlobals());
function setup() {
  const bitmap = { close: vi.fn() },
    draw = vi.fn(),
    blob = new Blob(['worker image']);
  const fetch = vi.fn(async (_url: URL) => ({ ok: true, blob: async () => new Blob(['png']) }));
  const decode = vi.fn(async () => bitmap);
  const state = { context: { drawImage: draw } as { drawImage: typeof draw } | null };
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('createImageBitmap', decode);
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return state.context;
      }
      async convertToBlob() {
        return blob;
      }
    },
  );
  return { bitmap, draw, blob, fetch, decode, state };
}
describe('HTML thumbnails in a headless worker', () => {
  it('requests the small native surface, resizes off the UI thread and releases the decoded bitmap', async () => {
    const f = setup();
    expect(await renderHtmlThumbnail(request)).toBe(f.blob);
    const url = f.fetch.mock.calls[0]![0] as unknown as URL;
    expect(url.searchParams.get('width')).toBe('240');
    expect(url.searchParams.get('timeMs')).toBe('1000');
    expect(f.decode).toHaveBeenCalledWith(expect.any(Blob), { resizeWidth: 240, resizeHeight: 135 });
    expect(f.draw).toHaveBeenCalledWith(f.bitmap, 0, 0);
    expect(f.bitmap.close).toHaveBeenCalledOnce();
  });
  it('rejects untrusted endpoints, invalid widths, dimensions and clocks before fetching', async () => {
    const f = setup();
    for (const patch of [
      { url: 'https://example.com/file' },
      { url: 'http://127.0.0.1:10/rpc' },
      { timeMs: NaN },
      { timeMs: -1 },
      { width: 120 },
      { height: 0 },
      { height: 32769 },
    ])
      await expect(renderHtmlThumbnail({ ...request, ...patch })).rejects.toThrow('Invalid HTML');
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it('reports failed captures and releases decoded pixels on a missing canvas context', async () => {
    const f = setup();
    f.fetch.mockResolvedValueOnce({ ok: false, status: 404 } as never);
    await expect(renderHtmlThumbnail(request)).rejects.toThrow('(404)');
    f.state.context = null;
    await expect(renderHtmlThumbnail(request)).rejects.toThrow('canvas unavailable');
    expect(f.bitmap.close).toHaveBeenCalledOnce();
  });
});
