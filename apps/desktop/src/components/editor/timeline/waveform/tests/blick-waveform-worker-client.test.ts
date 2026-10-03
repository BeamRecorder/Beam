import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlickWaveformData, BlickWaveformWorkerRequest, BlickWaveformWorkerReply } from '../blick-waveform-types';
import { acquireBlickWaveformWorker } from '../blick-waveform-worker-client';
const workers: TestWorker[] = [];
const leases: ReturnType<typeof acquireBlickWaveformWorker>[] = [];
class TestWorker {
  onmessage: ((event: MessageEvent<BlickWaveformWorkerReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn((_request: BlickWaveformWorkerRequest, _transfer: Transferable[]) => undefined);
  terminate = vi.fn();
  constructor() {
    workers.push(this);
  }
  reply(reply: BlickWaveformWorkerReply) {
    this.onmessage?.({ data: reply } as MessageEvent<BlickWaveformWorkerReply>);
  }
}
const data: BlickWaveformData = {
  bars: [10, 20],
  bands: new Float32Array(8).fill(0.5),
  sourceDurationSeconds: 3,
  loadingSegments: [{ leftPercent: 0, widthPercent: 10 }],
};
const bitmap = (width = 240) => ({ width, height: 80, close: vi.fn() }) as unknown as ImageBitmap;
const target = () => {
  const context = { clearRect: vi.fn(), drawImage: vi.fn() };
  const canvas = {
    width: 1,
    height: 1,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement;
  return { canvas, context };
};
const acquire = () => {
  const lease = acquireBlickWaveformWorker();
  leases.push(lease);
  return lease;
};
const lastRequest = () => workers[0]!.postMessage.mock.calls.at(-1)![0];
beforeEach(() => {
  workers.length = 0;
  vi.stubGlobal('Worker', TestWorker);
});
afterEach(() => {
  leases.splice(0).forEach((l) => l.dispose());
  vi.unstubAllGlobals();
});
describe('shared waveform worker', () => {
  it('shares one worker, clones reactive inputs, transfers only the cloned bands and closes committed bitmaps', async () => {
    const first = acquire(),
      second = acquire();
    const { canvas, context } = target();
    const drawing = first.draw(canvas, data, 120, 40);
    const request = lastRequest();
    expect(workers).toHaveLength(1);
    expect(request.data.bars).toEqual(data.bars);
    expect(request.data.bars).not.toBe(data.bars);
    expect(request.data.bands).not.toBe(data.bands);
    expect(request.data.loadingSegments).not.toBe(data.loadingSegments);
    expect(workers[0]!.postMessage.mock.calls[0]![1]).toEqual([request.data.bands.buffer]);
    const image = bitmap();
    workers[0]!.reply({ id: request.id, bitmap: image });
    expect(await drawing).toBe(true);
    expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0);
    expect(canvas.width).toBe(240);
    expect(canvas.height).toBe(80);
    expect(image.close).toHaveBeenCalledOnce();
    first.dispose();
    expect(workers[0]!.terminate).not.toHaveBeenCalled();
    second.dispose();
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
  });
  it('drops stale and duplicate replies without overwriting the current canvas', async () => {
    const lease = acquire();
    const { canvas, context } = target();
    const stale = lease.draw(canvas, data, 120, 40);
    const old = lastRequest();
    const fresh = lease.draw(canvas, data, 240, 80);
    const next = lastRequest();
    const current = bitmap();
    workers[0]!.reply({ id: next.id, bitmap: current });
    expect(await fresh).toBe(true);
    const previous = bitmap(1);
    workers[0]!.reply({ id: old.id, bitmap: previous });
    expect(await stale).toBe(false);
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(previous.close).toHaveBeenCalledOnce();
    const duplicate = bitmap();
    workers[0]!.reply({ id: old.id, bitmap: duplicate });
    expect(duplicate.close).toHaveBeenCalledOnce();
    workers[0]!.reply({ id: -1, error: 'stale' });
  });
  it('releases a single lease during a pending job while another clip keeps the worker alive', async () => {
    const first = acquire();
    acquire();
    const { canvas, context } = target();
    const drawing = first.draw(canvas, data, 120, 40);
    const request = lastRequest();
    first.dispose();
    const image = bitmap();
    workers[0]!.reply({ id: request.id, bitmap: image });
    expect(await drawing).toBe(false);
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(image.close).toHaveBeenCalledOnce();
    expect(await first.draw(canvas, data, 1, 1)).toBe(false);
    first.dispose();
    expect(workers[0]!.terminate).not.toHaveBeenCalled();
  });
  it('rejects pending jobs and terminates the worker when the final clip leaves', async () => {
    const lease = acquire();
    const drawing = lease.draw(target().canvas, data, 120, 40);
    lease.dispose();
    await expect(drawing).rejects.toThrow('disposed');
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    const next = acquire();
    expect(workers).toHaveLength(2);
    next.dispose();
  });
  it('reports GPU worker errors and permits a later valid reply', async () => {
    const lease = acquire();
    const canvas = target().canvas;
    const failed = lease.draw(canvas, data, 120, 40);
    workers[0]!.reply({ id: lastRequest().id, error: 'GPU lost' });
    await expect(failed).rejects.toThrow('GPU lost');
    const retry = lease.draw(canvas, data, 120, 40);
    workers[0]!.reply({ id: lastRequest().id, bitmap: bitmap() });
    expect(await retry).toBe(true);
  });
  it.each(['crash', 'message', 'empty'] as const)(
    'rejects current and subsequent jobs after %s failure',
    async (kind) => {
      const lease = acquire();
      const canvas = target().canvas;
      const failed = lease.draw(canvas, data, 120, 40);
      if (kind === 'message') workers[0]!.onmessageerror?.();
      else
        workers[0]!.onerror?.({
          message: kind === 'empty' ? '' : 'crashed',
        } as ErrorEvent);
      await expect(failed).rejects.toThrow(
        kind === 'message' ? 'could not be read' : kind === 'empty' ? 'worker stopped' : 'crashed',
      );
      await expect(lease.draw(canvas, data, 120, 40)).rejects.toThrow();
    },
  );
  it('rejects an unclonable request without leaking its pending entry', async () => {
    const lease = acquire();
    workers[0]!.postMessage.mockImplementationOnce(() => {
      throw new Error('clone failed');
    });
    await expect(lease.draw(target().canvas, data, 120, 40)).rejects.toThrow('clone failed');
    const late = bitmap();
    workers[0]!.reply({ id: lastRequest().id, bitmap: late });
    expect(late.close).toHaveBeenCalledOnce();
  });
  it('closes the bitmap even if the destination canvas has no context or drawing throws', async () => {
    const lease = acquire();
    const { canvas } = target();
    vi.mocked(canvas.getContext).mockReturnValue(null);
    const missing = lease.draw(canvas, data, 120, 40);
    const image = bitmap();
    workers[0]!.reply({ id: lastRequest().id, bitmap: image });
    await expect(missing).rejects.toThrow('canvas is unavailable');
    expect(image.close).toHaveBeenCalledOnce();
    const destination = target();
    destination.canvas.width = 240;
    destination.canvas.height = 80;
    destination.context.drawImage.mockImplementation(() => {
      throw new Error('draw failed');
    });
    const fail = lease.draw(destination.canvas, data, 120, 40);
    const failedImage = bitmap();
    workers[0]!.reply({ id: lastRequest().id, bitmap: failedImage });
    await expect(fail).rejects.toThrow('draw failed');
    expect(failedImage.close).toHaveBeenCalledOnce();
  });
});
