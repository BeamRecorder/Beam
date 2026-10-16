import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeHoversInWorker } from './hover-worker-client';

function fixture() {
  const worker = {
    terminate: vi.fn(),
    postMessage: vi.fn(),
    onmessage: null as unknown,
    onerror: null as unknown,
    onmessageerror: null as unknown,
  };
  const send = (data: unknown) => (worker.onmessage as (event: { data: unknown }) => void)({ data });
  const input = { sources: [], path: new Float64Array([0, 0, 0, 1]) };
  const controller = new AbortController();
  const start = () => analyzeHoversInWorker(input, controller.signal, () => worker as unknown as Worker);
  return { worker, send, input, controller, start };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe('hover worker lifetime', () => {
  it('transfers only the compact path and terminates on completion', async () => {
    const f = fixture(),
      pending = f.start();
    expect(f.worker.postMessage).toHaveBeenCalledWith(f.input, [f.input.path.buffer]);
    f.send({ type: 'complete', sync: { version: 1, ranges: [] } });
    await expect(pending).resolves.toEqual({ version: 1, ranges: [] });
    f.send({ type: 'error', message: 'late' });
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('aborts before construction or during analysis', async () => {
    const before = fixture();
    before.controller.abort();
    expect(() => before.start()).toThrow();
    expect(before.worker.postMessage).not.toHaveBeenCalled();
    const f = fixture(),
      pending = f.start();
    f.controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('extends the inactivity deadline only on real progress', async () => {
    const f = fixture(),
      pending = f.start();
    const failure = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(29_999);
    expect(f.worker.terminate).not.toHaveBeenCalled();
    f.send({ type: 'progress' });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(f.worker.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await failure;
    expect(f.worker.terminate).toHaveBeenCalledOnce();
  });
  it.each([
    { type: 'bad' },
    { type: 'complete', sync: { version: 2, ranges: [] } },
    { type: 'error', message: 'decode failed' },
  ])('rejects invalid results and decoder failures: %j', async (reply) => {
    const f = fixture(),
      pending = f.start();
    f.send(reply);
    await expect(pending).rejects.toThrow();
    expect(f.worker.terminate).toHaveBeenCalledOnce();
  });
  it.each(['onerror', 'onmessageerror'] as const)('terminates after %s', async (event) => {
    const f = fixture(),
      pending = f.start();
    (f.worker[event] as (event: { message: string }) => void)({ message: 'crashed' });
    await expect(pending).rejects.toThrow();
    expect(f.worker.terminate).toHaveBeenCalledOnce();
  });
  it('cleans up if transferring the input fails', async () => {
    const f = fixture();
    f.worker.postMessage.mockImplementation(() => {
      throw new Error('cannot transfer');
    });
    await expect(f.start()).rejects.toThrow('cannot transfer');
    expect(f.worker.terminate).toHaveBeenCalledOnce();
  });
});
