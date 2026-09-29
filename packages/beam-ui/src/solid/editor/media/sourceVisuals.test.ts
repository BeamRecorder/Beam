import { expect, it, vi } from 'vitest';
import type { EditorApi } from '../shared/editorApi';
import type { VisualLease } from './visualTypes';
import { createSourceVisuals } from './sourceVisuals';
const request = { kind: 'video', positionMs: 1000 } as const;
const lease: VisualLease = { key: 'native', canvasId: 42, status: 'ready', error: null };
function harness() {
  let event: (value: VisualLease) => void = () => {};
  const unsubscribe = vi.fn(), acquireVisual = vi.fn().mockResolvedValue(lease), releaseVisual = vi.fn().mockResolvedValue(null);
  const api = { acquireVisual, releaseVisual, onVisual: (fn: typeof event) => { event = fn; return unsubscribe; } } as unknown as EditorApi;
  return { manager: createSourceVisuals(api), acquireVisual, releaseVisual, unsubscribe, event: (value: VisualLease) => event(value) };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
it('deduplicates visible subscriptions and releases only the last owner', async () => {
  const h = harness(), a = vi.fn(), b = vi.fn();
  const offA = h.manager.subscribe('p', 'a', request, a), offB = h.manager.subscribe('p', 'a', request, b);
  expect(a).toHaveBeenCalledWith({ status: 'loading', error: null }); await flush(); expect(h.acquireVisual).toHaveBeenCalledTimes(1);
  offA(); expect(h.releaseVisual).not.toHaveBeenCalled(); h.event({ ...lease, status: 'failed', error: 'decode' }); expect(b).toHaveBeenLastCalledWith(expect.objectContaining({ error: 'decode' }));
  offB(); expect(h.releaseVisual).toHaveBeenCalledWith('native'); h.manager.dispose(); h.manager.dispose(); expect(h.unsubscribe).toHaveBeenCalledTimes(1);
});
it('releases cancelled pending replies and isolates later subscribers', async () => {
  const h = harness(); let resolve: (value: VisualLease) => void = () => {};
  h.acquireVisual.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const callback = vi.fn(); h.manager.subscribe('p', 'a', request, callback)();
  const next = vi.fn(); h.manager.subscribe('other', 'a', request, next);
  resolve(lease); await flush(); expect(callback).toHaveBeenCalledTimes(1); expect(next).toHaveBeenCalledTimes(2); expect(h.releaseVisual).toHaveBeenCalledWith('native'); h.manager.dispose();
});
it('retains early streaming events, reports acquisition failures and rejects disposed work', async () => {
  const h = harness(), fn = vi.fn(); h.manager.subscribe('p', 'a', request, fn);
  h.event({ ...lease, status: 'failed', error: 'early' }); await flush(); expect(fn).toHaveBeenLastCalledWith(expect.objectContaining({ error: 'early' }));
  h.acquireVisual.mockRejectedValueOnce(new Error('missing source')); const failed = vi.fn(); h.manager.subscribe('p', 'b', request, failed); await flush(); expect(failed).toHaveBeenLastCalledWith({ status: 'failed', error: 'Error: missing source' });
  h.manager.dispose(); h.manager.subscribe('p', 'c', request, fn)(); expect(h.acquireVisual).toHaveBeenCalledTimes(2);
});
it('ignores late errors and releases replies after whole-manager disposal', async () => {
  const h = harness(); let resolve: (value: VisualLease) => void = () => {};
  h.acquireVisual.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const fn = vi.fn(); h.manager.subscribe('p', 'a', request, fn); h.manager.dispose(); resolve(lease); await flush(); expect(h.releaseVisual).toHaveBeenCalledWith('native'); expect(fn).toHaveBeenCalledTimes(1);
});
it('retries only failures, releases the old native generation first and ignores stale events', async () => {
  const h = harness(), fn = vi.fn();
  h.acquireVisual.mockResolvedValueOnce({ ...lease, status: 'failed', error: 'missing' });
  h.manager.subscribe('p', 'a', request, fn); await flush();
  h.acquireVisual.mockResolvedValue({ ...lease, canvasId: 99 }); h.manager.retryFailed();
  expect(h.releaseVisual).toHaveBeenCalledWith('native'); await flush(); await flush();
  expect(fn).toHaveBeenLastCalledWith(expect.objectContaining({ canvasId: 99, status: 'ready' }));
  h.event({ ...lease, status: 'failed', error: 'stale' }); expect(fn).toHaveBeenLastCalledWith(expect.objectContaining({ canvasId: 99, status: 'ready' }));
  h.manager.retryFailed(); expect(h.acquireVisual).toHaveBeenCalledTimes(2);
  h.manager.dispose(); h.event({ ...lease, status: 'failed', error: 'late' });
  expect(fn).toHaveBeenLastCalledWith(expect.objectContaining({ canvasId: 99 }));
});
it('retries rejected acquisitions and handles disposal during a retry', async () => {
  const h = harness(), fn = vi.fn(); h.acquireVisual.mockRejectedValueOnce(new Error('IO'));
  const off = h.manager.subscribe('p', 'a', request, fn); await flush(); h.manager.retryFailed(); off();
  await flush(); await flush(); expect(h.releaseVisual).not.toHaveBeenCalled(); expect(h.acquireVisual).toHaveBeenCalledTimes(1);
  h.manager.dispose(); expect(fn).toHaveBeenLastCalledWith({ status: 'loading', error: null });
});
