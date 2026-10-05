import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaSegmentWriter } from '../media-segment-writer';

const blob = (bytes = 1): Blob => ({ size: bytes, arrayBuffer: async () => new ArrayBuffer(bytes) }) as Blob;
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};
afterEach(() => vi.useRealTimers());

describe('bounded recording writer', () => {
  it('streams two hours of chunks without retaining a list of completed writes', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const writer = new MediaSegmentWriter({ write, onError, maxPendingBytes: 2, maxPendingChunks: 2 });
    for (let second = 0; second < 7200; second++) {
      writer.enqueue(blob());
      await writer.flush();
    }
    expect(write).toHaveBeenCalledTimes(7200);
    expect(write).toHaveBeenLastCalledWith(new Uint8Array(1), 7199);
    expect(onError).not.toHaveBeenCalled();
  });

  it('serializes IPC and reclaims pending bytes after each acknowledgement', async () => {
    const first = deferred<void>();
    const write = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const writer = new MediaSegmentWriter({ write, onError: vi.fn(), maxPendingBytes: 4 });
    writer.enqueue(blob(2));
    writer.enqueue(blob(2));
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    first.resolve();
    await writer.flush();
    writer.enqueue(blob(4));
    await writer.flush();
    expect(write.mock.calls.map((call) => call[1])).toEqual([0, 1, 2]);
  });

  it.each([{ maxPendingBytes: 2 }, { maxPendingChunks: 2 }])('bounds a stalled writer by %j', async (limit) => {
    const pending = deferred<void>();
    const write = vi.fn(() => pending.promise);
    const onError = vi.fn();
    const writer = new MediaSegmentWriter({ write, onError, ...limit });
    writer.enqueue(blob());
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    for (let second = 1; second < 600; second++) writer.enqueue(blob());
    expect(onError).toHaveBeenCalledOnce();
    pending.resolve();
    await expect(writer.flush()).rejects.toThrow('too slow');
    expect(write).toHaveBeenCalledOnce();
  });

  it('rejects one oversized blob without converting or sending it', async () => {
    const chunk = blob(33 * 1024 * 1024);
    const convert = vi.spyOn(chunk, 'arrayBuffer');
    const write = vi.fn();
    const writer = new MediaSegmentWriter({ write, onError: vi.fn() });
    writer.enqueue(chunk);
    await expect(writer.flush()).rejects.toThrow('too slow');
    expect(convert).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it.each([new Error('disk full'), 'transport closed'])('reports a failed IPC once: %s', async (reason) => {
    const onError = vi.fn();
    const write = vi.fn().mockRejectedValue(reason);
    const writer = new MediaSegmentWriter({ write, onError });
    writer.enqueue(blob());
    writer.enqueue(blob());
    await expect(writer.flush()).rejects.toThrow(reason instanceof Error ? reason.message : reason);
    writer.enqueue(blob());
    expect(onError).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledOnce();
  });

  it('times out a lost acknowledgement and does not send subsequent chunks', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const write = vi.fn(() => new Promise<void>(() => undefined));
    const writer = new MediaSegmentWriter({ write, onError, timeoutMs: 20 });
    writer.enqueue(blob());
    writer.enqueue(blob());
    const flushed = expect(writer.flush()).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(20);
    await flushed;
    expect(onError).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts queued writes and ignores empty and late chunks', async () => {
    const write = vi.fn();
    const onError = vi.fn();
    const writer = new MediaSegmentWriter({ write, onError });
    writer.enqueue(blob(0));
    writer.enqueue(blob());
    writer.abort();
    writer.enqueue(blob());
    await writer.flush();
    expect(write).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not send a blob that finishes conversion after abort', async () => {
    const conversion = deferred<ArrayBuffer>();
    const started = vi.fn(() => conversion.promise);
    const write = vi.fn();
    const writer = new MediaSegmentWriter({ write, onError: vi.fn() });
    writer.enqueue({ size: 1, arrayBuffer: started } as unknown as Blob);
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
    writer.abort();
    conversion.resolve(new ArrayBuffer(1));
    await writer.flush();
    expect(write).not.toHaveBeenCalled();
  });

  it('ignores an IPC failure after owner teardown', async () => {
    const pending = deferred<void>();
    const onError = vi.fn();
    const write = vi.fn(() =>
      pending.promise.then(() => {
        throw new Error('closed');
      }),
    );
    const writer = new MediaSegmentWriter({ write, onError });
    writer.enqueue(blob());
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    writer.abort();
    pending.resolve();
    await writer.flush();
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([0, -1, 0.5, Infinity, NaN])('rejects invalid queue limits: %s', (limit) => {
    expect(() => new MediaSegmentWriter({ write: vi.fn(), onError: vi.fn(), maxPendingBytes: limit })).toThrow(
      'limits',
    );
    expect(() => new MediaSegmentWriter({ write: vi.fn(), onError: vi.fn(), maxPendingChunks: limit })).toThrow(
      'limits',
    );
  });
});
