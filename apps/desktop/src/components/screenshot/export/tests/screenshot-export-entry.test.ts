import { afterEach, expect, it, vi } from 'vitest';
import { requestFixture } from './export-test-support';
const worker = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../screenshot-export-worker', () => ({ runScreenshotExport: worker.run }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it('registers one message listener and forwards transferable replies through the worker boundary', async () => {
  const host = { onmessage: null as ((event: MessageEvent) => void) | null, postMessage: vi.fn() };
  vi.stubGlobal('self', host);
  worker.run.mockImplementation((_request, post) => {
    const bytes = new ArrayBuffer(4);
    post({ bytes }, [bytes]);
  });
  await import('../screenshot-export.worker');
  const request = requestFixture();
  host.onmessage!(new MessageEvent('message', { data: request }));
  expect(worker.run).toHaveBeenCalledWith(request, expect.any(Function));
  expect(host.postMessage).toHaveBeenCalledWith(
    { bytes: expect.any(ArrayBuffer) },
    { transfer: [expect.any(ArrayBuffer)] },
  );
});
