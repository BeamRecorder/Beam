// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createHttpFrameSource } from './http-frame-source';
afterEach(() => vi.unstubAllGlobals());
const setup = () => {
  const close = vi.fn(),
    bitmap = { width: 20, height: 30, close };
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(new Blob(['png']))),
    decode = vi.fn(async () => bitmap);
  vi.stubGlobal('location', { href: 'http://127.0.0.1/render' });
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('createImageBitmap', decode);
  return { close, fetch, decode, bitmap };
};
it('seeks the provider using source milliseconds and owns/relinquishes each bitmap once', async () => {
  const { fetch, close, bitmap } = setup();
  const lease = await createHttpFrameSource('/frame?auth=token').frameAt(125, new AbortController().signal);
  expect(String(fetch.mock.calls[0]?.[0])).toBe('http://127.0.0.1/frame?auth=token&timeMs=125');
  expect(lease.media).toEqual({ source: bitmap, width: 20, height: 30 });
  lease.close();
  lease.close();
  expect(close).toHaveBeenCalledOnce();
});
it('rejects invalid endpoints, times, HTTP errors and aborted requests', async () => {
  const { fetch } = setup();
  expect(() => createHttpFrameSource('file:///private')).toThrow('HTTP');
  const source = createHttpFrameSource('/frame'),
    controller = new AbortController();
  await expect(source.frameAt(-1, controller.signal)).rejects.toThrow('time');
  fetch.mockResolvedValueOnce(new Response('failed', { status: 500 }));
  await expect(source.frameAt(0, controller.signal)).rejects.toThrow('500');
  controller.abort();
  await expect(source.frameAt(0, controller.signal)).rejects.toThrow();
});
it('releases a decoded bitmap when cancellation arrives during decoding', async () => {
  const { decode, close, bitmap } = setup(),
    controller = new AbortController();
  decode.mockImplementationOnce(async () => {
    controller.abort();
    return bitmap;
  });
  await expect(createHttpFrameSource('/frame').frameAt(0, controller.signal)).rejects.toThrow();
  expect(close).toHaveBeenCalledOnce();
});
