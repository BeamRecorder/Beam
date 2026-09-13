import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaSourceDescriptor } from '../../shared/media-types';
import {
  assertWaveformWorkerResponse,
  isWaveformWorkerRequest,
  isWaveformWorkerResponse,
  type WaveformWorkerResponse,
} from '../waveform-protocol';

const runtime = vi.hoisted(() => ({ extractWaveformPeaks: vi.fn() }));

vi.mock('../waveform', () => ({ extractWaveformPeaks: runtime.extractWaveformPeaks }));

const source = (overrides: Partial<MediaSourceDescriptor> = {}): MediaSourceDescriptor => ({
  assetId: 'audio-1',
  kind: 'audio',
  label: 'Recording audio',
  url: 'project-media://asset/audio-1',
  ...overrides,
});

const extract = (overrides: Record<string, unknown> = {}) => ({
  type: 'extract',
  generation: 1,
  clipId: 'clip-1',
  source: source(),
  startSeconds: 2,
  endSeconds: 4,
  pointCount: 64,
  segmentIndex: 0,
  segmentCount: 1,
  ...overrides,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

let workerSelf: { onmessage?: (event: MessageEvent<unknown>) => void; postMessage: ReturnType<typeof vi.fn> };

const flush = async () => {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 10));
};

const messages = () => workerSelf.postMessage.mock.calls.map(([message]) => message as WaveformWorkerResponse);

beforeEach(async () => {
  vi.resetModules();
  runtime.extractWaveformPeaks.mockReset();
  workerSelf = { onmessage: undefined, postMessage: vi.fn() };
  vi.stubGlobal('self', workerSelf);
  await import('../waveform.worker');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const send = (message: unknown) => workerSelf.onmessage!({ data: message } as MessageEvent<unknown>);

describe('waveform worker protocol', () => {
  it('accepts bounded segmented extraction requests and rejects invalid segment metadata', () => {
    expect(isWaveformWorkerRequest(extract())).toBe(true);
    expect(isWaveformWorkerRequest({ type: 'clear', generation: 2 })).toBe(true);
    expect(isWaveformWorkerRequest(extract({ startSeconds: 4, endSeconds: 4, pointCount: 0 }))).toBe(false);
    expect(isWaveformWorkerRequest(extract({ segmentIndex: 3, segmentCount: 3 }))).toBe(false);
    expect(isWaveformWorkerRequest(extract({ segmentIndex: -1, segmentCount: 3 }))).toBe(false);
    expect(isWaveformWorkerRequest(extract({ segmentIndex: 0, segmentCount: 0 }))).toBe(false);
    expect(isWaveformWorkerRequest(extract({ source: source({ url: 'file:///absolute/path/audio.webm' }) }))).toBe(
      false,
    );
  });

  it('validates streamed result offsets and completion markers', () => {
    const result: WaveformWorkerResponse = {
      type: 'result',
      generation: 1,
      clipId: 'clip-1',
      peaks: new Float32Array([0, 1]),
      bands: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      segmentIndex: 0,
      segmentCount: 1,
      segmentPointOffset: 0,
      segmentComplete: true,
    };
    const error: WaveformWorkerResponse = {
      type: 'error',
      generation: 1,
      clipId: 'clip-1',
      error: { kind: 'decode-failure', sourceId: 'audio-1', message: 'decoder failed' },
    };
    expect(isWaveformWorkerResponse(result)).toBe(true);
    expect(isWaveformWorkerResponse(error)).toBe(true);
    expect(() => assertWaveformWorkerResponse(result)).not.toThrow();
    expect(isWaveformWorkerResponse({ ...result, peaks: [0, 1] })).toBe(false);
    expect(isWaveformWorkerResponse({ ...result, bands: undefined })).toBe(false);
    expect(isWaveformWorkerResponse({ ...result, bands: [0.1, 0.2, 0.3, 0.4] })).toBe(false);
    expect(isWaveformWorkerResponse({ ...result, bands: new Float32Array(3) })).toBe(false);
    expect(isWaveformWorkerResponse({ ...result, bands: new Float32Array(6) })).toBe(false);
    expect(() => assertWaveformWorkerResponse({ ...result, bands: new Float32Array(3) })).toThrow(
      'Invalid waveform worker response.',
    );
    expect(isWaveformWorkerResponse({ ...result, segmentPointOffset: -1 })).toBe(false);
    expect(isWaveformWorkerResponse({ ...result, segmentComplete: undefined })).toBe(false);
    expect(isWaveformWorkerResponse({ ...error, error: { kind: 'decode-failure' } })).toBe(false);
  });
});

describe('waveform worker', () => {
  it('forwards ordered 32-point chunks for one segment without a coarse stage', async () => {
    const firstPeaks = new Float32Array(32 * 2).fill(0.25);
    const firstBands = new Float32Array(32 * 4).fill(0.125);
    const secondPeaks = new Float32Array((64 - 32) * 2).fill(0.25);
    const secondBands = new Float32Array((64 - 32) * 4).fill(0.25);
    runtime.extractWaveformPeaks.mockImplementation(
      async (_source, _start, _end, _pointCount: number, options?: { onProgress: (value: unknown) => void }) => {
        options?.onProgress({ pointOffset: 0, peaks: firstPeaks, bands: firstBands, complete: false });
        options?.onProgress({
          pointOffset: 32,
          peaks: secondPeaks,
          bands: secondBands,
          complete: true,
        });
      },
    );

    send(extract({ generation: 3, pointCount: 64, segmentIndex: 1, segmentCount: 3 }));
    await flush();

    expect(runtime.extractWaveformPeaks).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'audio-1' }),
      2,
      4,
      64,
      expect.objectContaining({ pointsPerChunk: 32 }),
    );
    expect(messages()).toEqual([
      expect.objectContaining({
        type: 'result',
        generation: 3,
        clipId: 'clip-1',
        segmentIndex: 1,
        segmentCount: 3,
        segmentPointOffset: 0,
        segmentComplete: false,
        peaks: expect.any(Float32Array),
        bands: expect.any(Float32Array),
      }),
      expect.objectContaining({
        type: 'result',
        generation: 3,
        clipId: 'clip-1',
        segmentIndex: 1,
        segmentCount: 3,
        segmentPointOffset: 32,
        segmentComplete: true,
        peaks: expect.any(Float32Array),
        bands: expect.any(Float32Array),
      }),
    ]);
    expect(messages().map((message) => (message.type === 'result' ? message.bands : null))).toEqual([
      firstBands,
      secondBands,
    ]);
    const transferLists = workerSelf.postMessage.mock.calls.map(
      ([, options]) => (options as { transfer: ArrayBufferLike[] }).transfer,
    );
    expect(transferLists).toEqual([
      [firstPeaks.buffer, firstBands.buffer],
      [secondPeaks.buffer, secondBands.buffer],
    ]);
  });

  it('preserves identity for three contiguous segments and drops stale generations', async () => {
    const first = deferred<Float32Array>();
    const second = deferred<Float32Array>();
    runtime.extractWaveformPeaks
      .mockImplementationOnce(
        async (_source, _start, _end, pointCount: number, options?: { onProgress: (value: unknown) => void }) => {
          await first.promise;
          options?.onProgress({
            pointOffset: 0,
            peaks: new Float32Array(pointCount * 2).fill(0.1),
            bands: new Float32Array(pointCount * 4).fill(0.1),
            complete: true,
          });
        },
      )
      .mockImplementationOnce(
        async (_source, _start, _end, pointCount: number, options?: { onProgress: (value: unknown) => void }) => {
          await second.promise;
          options?.onProgress({
            pointOffset: 0,
            peaks: new Float32Array(pointCount * 2).fill(0.9),
            bands: new Float32Array(pointCount * 4).fill(0.9),
            complete: true,
          });
        },
      );

    const segments = [
      extract({ generation: 1, segmentIndex: 0, segmentCount: 3, startSeconds: 0, endSeconds: 2, pointCount: 21 }),
      extract({ generation: 1, segmentIndex: 1, segmentCount: 3, startSeconds: 2, endSeconds: 4, pointCount: 21 }),
      extract({ generation: 1, segmentIndex: 2, segmentCount: 3, startSeconds: 4, endSeconds: 6, pointCount: 22 }),
    ];
    send(segments[0]);
    await flush();
    send({ type: 'clear', generation: 2 });
    send(extract({ generation: 2, clipId: 'new-clip', segmentIndex: 0, segmentCount: 1, pointCount: 32 }));
    await flush();

    first.resolve(new Float32Array([0, 0.1]));
    await flush();
    expect(messages()).toEqual([]);

    second.resolve(new Float32Array([0, 0.9]));
    await flush();
    expect(messages()).toEqual([
      expect.objectContaining({
        type: 'result',
        generation: 2,
        clipId: 'new-clip',
        segmentIndex: 0,
        segmentCount: 1,
        segmentPointOffset: 0,
        segmentComplete: true,
      }),
    ]);

    // Protocol-level identity remains explicit for all contiguous segment requests.
    expect(segments.map(({ segmentIndex }) => segmentIndex)).toEqual([0, 1, 2]);
    expect(segments[0]!.endSeconds).toBe(segments[1]!.startSeconds);
    expect(segments[1]!.endSeconds).toBe(segments[2]!.startSeconds);
    expect(segments.reduce((sum, segment) => sum + segment.pointCount, 0)).toBe(64);
  });

  it('skips queued extraction requests after a newer generation arrives', async () => {
    const inFlight = deferred<void>();
    runtime.extractWaveformPeaks
      .mockImplementationOnce(
        async (_source, _start, _end, pointCount: number, options?: { onProgress: (value: unknown) => void }) => {
          await inFlight.promise;
          options?.onProgress({
            pointOffset: 0,
            peaks: new Float32Array(pointCount * 2).fill(0.1),
            bands: new Float32Array(pointCount * 4).fill(0.1),
            complete: true,
          });
        },
      )
      .mockImplementationOnce(
        async (_source, _start, _end, pointCount: number, options?: { onProgress: (value: unknown) => void }) => {
          options?.onProgress({
            pointOffset: 0,
            peaks: new Float32Array(pointCount * 2).fill(0.9),
            bands: new Float32Array(pointCount * 4).fill(0.9),
            complete: true,
          });
        },
      );

    send(extract({ generation: 1, clipId: 'in-flight', pointCount: 1 }));
    await flush();
    send(extract({ generation: 1, clipId: 'stale-pending', pointCount: 1 }));
    send(extract({ generation: 2, clipId: 'current', pointCount: 1 }));
    inFlight.resolve();
    await flush();

    expect(runtime.extractWaveformPeaks).toHaveBeenCalledTimes(2);
    expect(messages()).toEqual([
      expect.objectContaining({
        type: 'result',
        generation: 2,
        clipId: 'current',
        bands: expect.any(Float32Array),
        segmentComplete: true,
      }),
    ]);
  });
});
