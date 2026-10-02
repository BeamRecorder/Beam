// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeWithWorker } from '../export-job';
import { exportJobFixture } from './export-job.fixture';

afterEach(() => vi.useRealTimers());
const start = (job = exportJobFixture(), onProgress = vi.fn()) => ({
  ...job,
  onProgress,
  running: encodeWithWorker(job.request, onProgress, job.controller.signal, job.host, job.diagnostics, []),
});
describe('platform-independent export jobs', () => {
  it('closes prepared resources without constructing a worker after cancellation', async () => {
    const job = exportJobFixture();
    job.controller.abort();
    const close = vi.fn();
    await expect(
      encodeWithWorker(job.request, vi.fn(), job.controller.signal, job.host, job.diagnostics, [
        { id: 'arrow', bitmap: { close } as unknown as ImageBitmap },
      ]),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(close).toHaveBeenCalledOnce();
    expect(job.host.createWorker).not.toHaveBeenCalled();
    expect(job.host.abort).toHaveBeenCalledOnce();
  });
  it('preserves backend construction failures even if output cleanup also fails', async () => {
    const job = exportJobFixture();
    job.host.createWorker.mockImplementationOnce(() => {
      throw new Error('Backend unavailable');
    });
    job.host.abort.mockRejectedValueOnce(new Error('Cleanup failed'));
    await expect(start(job).running).rejects.toThrow('Backend unavailable');
  });
  it('fails malformed messages and unexpected worker disposal explicitly', async () => {
    for (const message of [{ type: 'unknown' }, { type: 'disposed' }]) {
      const job = start();
      job.worker.emit(message);
      await expect(job.running).rejects.toThrow();
      expect(job.host.abort).toHaveBeenCalledOnce();
      expect(job.worker.terminate).toHaveBeenCalledOnce();
    }
  });
  it('propagates structured validation issues and ordinary codec errors', async () => {
    const issue = { code: 'missing-asset', message: 'Missing input' };
    const job = start();
    job.worker.emit({ type: 'error', error: { name: 'Error', message: issue.message, issue } });
    await expect(job.running).rejects.toMatchObject({ name: 'ExportValidationError', issue });
    const ordinary = start();
    ordinary.worker.emit({ type: 'error', error: { name: 'CodecError', message: 'Codec failed' } });
    await expect(ordinary.running).rejects.toMatchObject({ name: 'CodecError', message: 'Codec failed' });
  });
  it.each(['Worker crashed', ''])('reports native worker errors %j', async (message) => {
    const job = start();
    job.worker.onerror!({ message } as ErrorEvent);
    await expect(job.running).rejects.toThrow(message || 'The export Worker failed.');
  });
  it('terminates a nonresponsive cancelled backend after the disposal timeout', async () => {
    vi.useFakeTimers();
    const job = start();
    const rejected = expect(job.running).rejects.toMatchObject({ name: 'AbortError' });
    job.controller.abort();
    job.controller.abort();
    expect(job.worker.postMessage).toHaveBeenCalledWith({ type: 'cancel' });
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;
    expect(job.host.abort).toHaveBeenCalledOnce();
    expect(job.worker.terminate).toHaveBeenCalledOnce();
  });
  it('retains real progress diagnostics and final audio completion', async () => {
    const job = exportJobFixture();
    job.request.snapshot.composition.clips = [
      {
        id: 'audio',
        kind: 'audio',
        assetId: 'audio',
        name: 'Audio',
        timelineStartMs: 0,
        timelineDurationMs: 1000,
        sourceInMs: 0,
        sourceDurationMs: 1000,
        playbackRate: 1,
        enabled: true,
        order: 0,
        role: 'imported',
        volume: 100,
      },
    ];
    const running = start(job);
    running.worker.emit({ type: 'progress', progress: { ...job.progress, diagnostics: job.runtime } });
    running.worker.emit({ type: 'complete', diagnostics: job.runtime });
    await running.running;
    expect(running.onProgress.mock.calls.at(-1)?.[0]).toMatchObject({ audioProgress: 1, overallProgress: 1 });
    expect(job.diagnostics.completedAt).toBeTruthy();
    expect(job.diagnostics.runtime?.nativeFinalizationMs).toBeGreaterThanOrEqual(0);
  });
  it('does not publish a failed native finalization', async () => {
    const job = exportJobFixture();
    job.host.finalize.mockRejectedValueOnce(new Error('Disk full'));
    const running = start(job);
    job.worker.emit({ type: 'complete', diagnostics: job.runtime });
    await expect(running.running).rejects.toThrow('Disk full');
    expect(job.host.abort).toHaveBeenCalledOnce();
  });
  it('reports an unstructured chunk-write failure and releases the backend', async () => {
    const job = exportJobFixture();
    job.host.writeChunk.mockRejectedValueOnce('failed');
    const running = start(job);
    job.worker.emit({ type: 'chunk', sequence: 1, position: 0, data: new Uint8Array([1]) });
    await expect(running.running).rejects.toBe('failed');
    expect(job.worker.postMessage).toHaveBeenCalledWith({
      type: 'chunkError',
      sequence: 1,
      message: 'Export chunk write failed.',
    });
  });
});
