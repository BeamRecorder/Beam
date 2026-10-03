import { describe, expect, it, vi } from 'vitest';
import { createHtmlThumbnailClient } from './html-thumbnail-client';
import type { HtmlThumbnailWorker } from './html-thumbnail-types';

function setup() {
  const worker: HtmlThumbnailWorker = { onmessage: null, onerror: null, postMessage: vi.fn(), terminate: vi.fn() };
  const source = vi.fn(async () => 'http://127.0.0.1:100/frame/' + 'f'.repeat(64));
  return { worker, source, client: createHtmlThumbnailClient(worker, source) };
}
describe('HTML thumbnail worker transport', () => {
  it('retries a failed capability lookup without sending a stale request', async () => {
    const f = setup();
    f.source.mockRejectedValueOnce(new Error('not ready'));
    await expect(f.client.render(0, 240, 135)).rejects.toThrow('not ready');
    const result = f.client.render(0, 240, 135);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    f.worker.onmessage!({ data: { id: 1, blob: new Blob(['retry']) } } as MessageEvent);
    expect(await result).toBeInstanceOf(Blob);
    expect(f.source).toHaveBeenCalledTimes(2);
    f.client.dispose();
  });
  it.each([new Error('post failed'), 'post failed'])(
    'rejects a synchronous transport failure and releases its pending job',
    async (error) => {
      const f = setup();
      vi.mocked(f.worker.postMessage).mockImplementationOnce(() => {
        throw error;
      });
      await expect(f.client.render(0, 240, 135)).rejects.toThrow('post failed');
      f.client.dispose();
    },
  );
  it('resolves its capability once, routes concurrent results by identity and keeps pixels out of the UI', async () => {
    const f = setup();
    const first = f.client.render(1000, 240, 135),
      second = f.client.render(2000, 480, 270);
    await Promise.resolve();
    await Promise.resolve();
    expect(f.source).toHaveBeenCalledOnce();
    expect(f.worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 1, timeMs: 1000, width: 240 }));
    const blob = new Blob(['thumb']);
    f.worker.onmessage!({ data: { id: 2, blob } } as MessageEvent);
    f.worker.onmessage!({ data: { id: 1, blob } } as MessageEvent);
    expect(await first).toBe(blob);
    expect(await second).toBe(blob);
    f.worker.onmessage!({ data: { id: 99, blob } } as MessageEvent);
    f.client.dispose();
    expect(f.worker.terminate).toHaveBeenCalledOnce();
  });
  it('surfaces render errors, terminates failed workers and rejects future renders', async () => {
    const f = setup();
    const pending = f.client.render(0, 240, 135);
    await Promise.resolve();
    await Promise.resolve();
    f.worker.onmessage!({ data: { id: 1, error: 'missing asset' } } as MessageEvent);
    await expect(pending).rejects.toThrow('missing asset');
    const next = f.client.render(500, 240, 135);
    await Promise.resolve();
    await Promise.resolve();
    f.worker.onerror!({} as ErrorEvent);
    await expect(next).rejects.toThrow('worker failed');
    await expect(f.client.render(0, 240, 135)).rejects.toThrow('stopped');
    f.client.dispose();
    expect(f.worker.terminate).toHaveBeenCalledOnce();
  });
  it('rejects pending jobs on disposal and ignores late source resolution', async () => {
    const f = setup();
    const pending = f.client.render(0, 240, 135);
    await Promise.resolve();
    await Promise.resolve();
    f.client.dispose();
    f.client.dispose();
    await expect(pending).rejects.toThrow('stopped');
    const loading = setup();
    let finish!: (value: string) => void;
    loading.source.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const result = loading.client.render(0, 240, 135);
    loading.client.dispose();
    finish('unused');
    await expect(result).rejects.toThrow('stopped');
    expect(loading.worker.postMessage).not.toHaveBeenCalled();
  });
});
