import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaSourceDescriptor } from '../../shared/media-types';

const { openMediaInput, sinkSamples, sinkSamplesAtTimestamps, AudioSampleSink, MediaInputError } = vi.hoisted(() => {
  class TestMediaInputError extends Error {
    detail: unknown;

    constructor(detail: unknown) {
      super((detail as { message: string }).message);
      this.name = 'MediaInputError';
      this.detail = detail;
    }
  }

  class TestAudioSampleSink {
    constructor(track: unknown) {
      void track;
    }

    samples(...args: unknown[]) {
      return sinkSamples(...args);
    }

    samplesAtTimestamps(...args: unknown[]) {
      return sinkSamplesAtTimestamps(...args);
    }
  }

  return {
    openMediaInput: vi.fn(),
    sinkSamples: vi.fn(),
    sinkSamplesAtTimestamps: vi.fn(),
    AudioSampleSink: TestAudioSampleSink,
    MediaInputError: TestMediaInputError,
  };
});

vi.mock('../../shared', () => ({ openMediaInput, MediaInputError }));
vi.mock('mediabunny', () => ({ AudioSampleSink }));

import { extractWaveformPeaks } from '../waveform';

const descriptor: MediaSourceDescriptor = {
  assetId: 'audio-1',
  kind: 'audio',
  label: 'Audio',
  url: 'project-media://asset/audio-1',
};

const audioSample = (channels: number[][], sampleRate: number, timestamp = 0) => ({
  sampleRate,
  numberOfFrames: channels[0]?.length ?? 0,
  numberOfChannels: channels.length,
  timestamp,
  duration: (channels[0]?.length ?? 0) / sampleRate,
  allocationSize: vi.fn(({ planeIndex }: { planeIndex: number }) => (channels[planeIndex]?.length ?? 0) * 4),
  copyTo: vi.fn((destination: unknown, options: { planeIndex: number }) => {
    const values = Float32Array.from(channels[options.planeIndex] ?? []);
    if (destination instanceof Float32Array) destination.set(values);
    else if (destination instanceof ArrayBuffer) new Float32Array(destination).set(values);
  }),
  close: vi.fn(),
});

const openedInput = (track: unknown) => ({
  input: { getPrimaryAudioTrack: vi.fn().mockResolvedValue(track) },
  dispose: vi.fn(),
});

beforeEach(() => {
  openMediaInput.mockReset();
  sinkSamples.mockReset();
  sinkSamplesAtTimestamps.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('extractWaveformPeaks', () => {
  it('retrieves sparse audio samples in the requested range and aggregates bounded min/max bins', async () => {
    const track = { canDecode: vi.fn().mockResolvedValue(true) };
    const opened = openedInput(track);
    openMediaInput.mockResolvedValue(opened);
    sinkSamplesAtTimestamps.mockImplementation(async function* (timestamps: Iterable<number>) {
      const requested = [...timestamps];
      expect(requested).toHaveLength(2);
      expect(requested.every((timestamp) => timestamp >= 1 && timestamp < 3)).toBe(true);
      yield {
        ...audioSample([[0.4, 0.6, -0.2, 0.2]], 4, requested[0]),
      };
      yield {
        ...audioSample([[1, -1]], 4, requested[1]),
      };
    });

    const peaks = await extractWaveformPeaks(descriptor, 1, 3, 2);

    expect(peaks).toEqual(new Float32Array([-0.2, 0.6, -1, 1]));
    expect(openMediaInput).toHaveBeenCalledWith({ ...descriptor, kind: 'audio' });
    expect(opened.dispose).toHaveBeenCalledOnce();
    expect(peaks.length).toBe(4);
  });

  it('uses sparse timestamp retrieval instead of decoding every buffer in the full range', async () => {
    const track = { canDecode: vi.fn().mockResolvedValue(true) };
    const opened = openedInput(track);
    openMediaInput.mockResolvedValue(opened);
    sinkSamples.mockImplementation(() => {
      throw new Error('full-range AudioSampleSink.samples() must not be used for waveforms');
    });

    let requestedTimestamps: number[] = [];
    sinkSamplesAtTimestamps.mockImplementation(async function* (timestamps: Iterable<number>) {
      requestedTimestamps = [...timestamps];
      for (const timestamp of requestedTimestamps) {
        yield {
          ...audioSample([[0.25]], 100, timestamp),
        };
      }
    });

    const peaks = await extractWaveformPeaks(descriptor, 10, 610, 4);

    expect(sinkSamples).not.toHaveBeenCalled();
    expect(sinkSamplesAtTimestamps).toHaveBeenCalledOnce();
    expect(requestedTimestamps).toHaveLength(4);
    expect(requestedTimestamps.every((timestamp) => timestamp >= 10 && timestamp < 610)).toBe(true);
    expect(peaks).toEqual(new Float32Array([0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25]));
    expect(opened.dispose).toHaveBeenCalledOnce();
  });

  it('publishes ordered 32-point progress chunks with only the last chunk marked complete', async () => {
    const opened = openedInput({ canDecode: vi.fn().mockResolvedValue(true) });
    openMediaInput.mockResolvedValue(opened);
    sinkSamplesAtTimestamps.mockImplementation(async function* (timestamps: Iterable<number>) {
      for (const timestamp of timestamps) yield audioSample([[0.5]], 100, timestamp);
    });
    const progress: Array<{ pointOffset: number; peaks: Float32Array; complete: boolean }> = [];

    await extractWaveformPeaks(descriptor, 0, 1, 64, {
      pointsPerChunk: 32,
      shouldStop: () => false,
      onProgress: (value) => progress.push(value),
    });

    expect(progress.map(({ pointOffset }) => pointOffset)).toEqual([0, 32]);
    expect(progress.map(({ peaks }) => peaks.length / 2)).toEqual([32, 32]);
    expect(progress.map(({ complete }) => complete)).toEqual([false, true]);
    expect(progress[1]!.pointOffset).toBeGreaterThan(progress[0]!.pointOffset);
  });

  it('stops on request, closes the current sample, and leaves the unprocessed tail empty', async () => {
    const opened = openedInput({ canDecode: vi.fn().mockResolvedValue(true) });
    openMediaInput.mockResolvedValue(opened);
    const first = audioSample([[0.25]], 100);
    const second = audioSample([[0.75]], 100);
    sinkSamplesAtTimestamps.mockImplementation(async function* () {
      yield first;
      yield second;
    });
    let checks = 0;
    const progress: Array<{ complete: boolean }> = [];

    const peaks = await extractWaveformPeaks(descriptor, 0, 1, 4, {
      pointsPerChunk: 2,
      shouldStop: () => checks++ > 0,
      onProgress: ({ complete }) => progress.push({ complete }),
    });

    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).toHaveBeenCalledOnce();
    expect(peaks[0]).toBe(0.25);
    expect(peaks[1]).toBe(0.25);
    expect(Array.from(peaks.slice(2))).toEqual([0, 0, 0, 0, 0, 0]);
    expect(progress).toEqual([]);
    expect(opened.dispose).toHaveBeenCalledOnce();
  });

  it('averages channels while retaining the sample range in each bin', async () => {
    const opened = openedInput({ canDecode: vi.fn().mockResolvedValue(true) });
    openMediaInput.mockResolvedValue(opened);
    sinkSamplesAtTimestamps.mockImplementation(async function* () {
      yield {
        ...audioSample(
          [
            [-1, 0.5, 1, 0],
            [1, -0.5, -1, 0.4],
          ],
          4,
        ),
      };
    });

    await expect(extractWaveformPeaks(descriptor, 0, 1, 1)).resolves.toEqual(new Float32Array([0, 0.2]));
  });

  it('rejects invalid ranges and point counts before opening media', async () => {
    await expect(extractWaveformPeaks(descriptor, -1, 1, 4)).rejects.toThrow(RangeError);
    await expect(extractWaveformPeaks(descriptor, 0, 1, 0)).rejects.toThrow(RangeError);
    await expect(extractWaveformPeaks(descriptor, 0, 1, 1.5)).rejects.toThrow(RangeError);
    expect(openMediaInput).not.toHaveBeenCalled();
  });

  it('reports a missing audio track as an explicit media input error and disposes input', async () => {
    const opened = openedInput(null);
    openMediaInput.mockResolvedValue(opened);

    await expect(extractWaveformPeaks(descriptor, 0, 1, 4)).rejects.toMatchObject({
      name: 'MediaInputError',
      detail: {
        kind: 'missing-track',
        sourceId: 'audio-1',
        track: 'audio',
      },
    });
    expect(opened.dispose).toHaveBeenCalledOnce();
  });

  it('reports unsupported audio codecs explicitly and disposes after sink failures', async () => {
    const unsupportedTrack = {
      canDecode: vi.fn().mockResolvedValue(false),
      getCodec: vi.fn().mockResolvedValue('audio/unsupported'),
    };
    const unsupported = openedInput(unsupportedTrack);
    openMediaInput.mockResolvedValueOnce(unsupported);
    await expect(extractWaveformPeaks(descriptor, 0, 1, 4)).rejects.toMatchObject({
      detail: { kind: 'unsupported-codec', codec: 'audio/unsupported' },
    });
    expect(unsupported.dispose).toHaveBeenCalledOnce();

    const failing = openedInput({ canDecode: vi.fn().mockResolvedValue(true) });
    openMediaInput.mockResolvedValueOnce(failing);
    sinkSamplesAtTimestamps.mockImplementation(async function* () {
      throw new Error('decoder failed');
    });
    await expect(extractWaveformPeaks(descriptor, 0, 1, 4)).rejects.toThrow('decoder failed');
    expect(failing.dispose).toHaveBeenCalledOnce();
  });
});
