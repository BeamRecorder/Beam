import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaSourceDescriptor } from '../../shared/media-types';
import {
  assertWaveformWorkerResponse,
  isWaveformWorkerRequest,
  isWaveformWorkerResponse,
  type WaveformWorkerResponse,
} from '../waveform-protocol';

const runtime = vi.hoisted(() => ({
  extractWaveformPeaks: vi.fn(),
}));

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
  resolution: 'coarse',
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
  it('accepts extract and clear requests with bounded sparse extraction parameters', () => {
    expect(isWaveformWorkerRequest(extract())).toBe(true);
    expect(isWaveformWorkerRequest({ type: 'clear', generation: 2 })).toBe(true);
    expect(
      isWaveformWorkerRequest(
        extract({ startSeconds: 4, endSeconds: 4, pointCount: 0, resolution: 'unknown' }),
      ),
    ).toBe(false);
    expect(isWaveformWorkerRequest(extract({ source: source({ url: 'file:///absolute/path/audio.webm' }) }))).toBe(false);
  });

  it('accepts result and structured error responses, but rejects malformed payloads', () => {
    const result: WaveformWorkerResponse = {
      type: 'result',
      generation: 1,
      clipId: 'clip-1',
      resolution: 'coarse',
      peaks: new Float32Array([0, 1]),
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
    expect(isWaveformWorkerResponse({ ...error, error: { kind: 'decode-failure' } })).toBe(false);
  });
});

describe('waveform worker', () => {
  it('returns sparse extraction results with the requested coarse/refined resolution', async () => {
    runtime.extractWaveformPeaks.mockImplementation(async (_source, _start, _end, pointCount: number) => {
      return new Float32Array(pointCount * 2).fill(0.25);
    });

    send(extract({ generation: 3, resolution: 'coarse', pointCount: 64 }));
    await flush();
    send(extract({ generation: 3, resolution: 'refined', pointCount: 480 }));
    await flush();

    expect(runtime.extractWaveformPeaks).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ assetId: 'audio-1' }),
      2,
      4,
      64,
    );
    expect(runtime.extractWaveformPeaks).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ assetId: 'audio-1' }),
      2,
      4,
      480,
    );
    expect(messages()).toEqual([
      {
        type: 'result',
        generation: 3,
        clipId: 'clip-1',
        resolution: 'coarse',
        peaks: expect.any(Float32Array),
      },
      {
        type: 'result',
        generation: 3,
        clipId: 'clip-1',
        resolution: 'refined',
        peaks: expect.any(Float32Array),
      },
    ]);
  });

  it('does not publish a stale generation after a clear and processes the new generation', async () => {
    const first = deferred<Float32Array>();
    const second = deferred<Float32Array>();
    runtime.extractWaveformPeaks.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    send(extract({ generation: 1, clipId: 'old-clip' }));
    await flush();
    send({ type: 'clear', generation: 2 });
    send(extract({ generation: 2, clipId: 'new-clip' }));
    await flush();

    first.resolve(new Float32Array([0, 0.1]));
    await flush();
    expect(messages()).toEqual([]);

    second.resolve(new Float32Array([0, 0.9]));
    await flush();
    expect(messages()).toEqual([
      {
        type: 'result',
        generation: 2,
        clipId: 'new-clip',
        resolution: 'coarse',
        peaks: new Float32Array([0, 0.9]),
      },
    ]);
  });
});
