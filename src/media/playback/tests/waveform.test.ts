import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaSourceDescriptor } from '../../shared/media-types';

const { openMediaInput, sinkSamples, AudioSampleSink, MediaInputError } = vi.hoisted(() => {
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
  }

  return {
    openMediaInput: vi.fn(),
    sinkSamples: vi.fn(),
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

const sine = (frames: number, sampleRate: number, frequency: number, amplitude = 0.3) =>
  Array.from({ length: frames }, (_, frame) => amplitude * Math.sin((2 * Math.PI * frequency * frame) / sampleRate));

beforeEach(() => {
  openMediaInput.mockReset();
  sinkSamples.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('extractWaveformPeaks', () => {
  it('decodes sequential samples into exact half-open bins and keeps antiphase channel extrema', async () => {
    const track = { canDecode: vi.fn().mockResolvedValue(true) };
    const opened = openedInput(track);
    const sample = audioSample(
      [
        [0.9, -0.7, 0.4, -0.3, 0.6, -0.8, 0.2, -0.4],
        [-0.9, 0.7, -0.4, 0.3, -0.6, 0.8, -0.2, 0.4],
      ],
      4,
      1,
    );
    openMediaInput.mockResolvedValue(opened);
    sinkSamples.mockImplementation(async function* (start: number, end: number) {
      expect([start, end]).toEqual([1, 3]);
      yield sample;
    });

    const peaks = await extractWaveformPeaks(descriptor, 1, 3, 2);

    expect(sinkSamples).toHaveBeenCalledWith(1, 3);
    expect(peaks).toEqual(new Float32Array([-0.9, 0.9, -0.8, 0.8]));
    expect(sample.close).toHaveBeenCalledOnce();
    expect(opened.dispose).toHaveBeenCalledOnce();
  });

  it('captures impulses between former sparse sample timestamps', async () => {
    const opened = openedInput({ canDecode: vi.fn().mockResolvedValue(true) });
    const values = Array.from({ length: 100 }, () => 0);
    values[9] = 0.75;
    values[39] = -0.9;
    openMediaInput.mockResolvedValue(opened);
    sinkSamples.mockImplementation(async function* () {
      yield audioSample([values], 100);
    });

    const peaks = await extractWaveformPeaks(descriptor, 0, 1, 10);

    expect(peaks[1]).toBe(0.75);
    expect(peaks[6]).toBeCloseTo(-0.9, 6);
    expect(opened.dispose).toHaveBeenCalledOnce();
  });

  it('clips samples to the requested start and excludes the exact end boundary', async () => {
    const opened = openedInput({ canDecode: vi.fn().mockResolvedValue(true) });
    openMediaInput.mockResolvedValue(opened);
    sinkSamples.mockImplementation(async function* () {
      yield audioSample([[0.9, -0.8, -0.2, 0.3, -0.4, 0.95, -0.7]], 4);
    });

    const peaks = await extractWaveformPeaks(descriptor, 0.5, 1.25, 3);

    expect(peaks).toEqual(new Float32Array([-0.2, 0, 0, 0.3, -0.4, 0]));
  });

  it('returns zeroed bins and a completed progress chunk when the range has no samples', async () => {
    const opened = openedInput({ canDecode: vi.fn().mockResolvedValue(true) });
    openMediaInput.mockResolvedValue(opened);
    sinkSamples.mockImplementation(async function* () {});
    const progress: Array<{ pointOffset: number; peaks: Float32Array; bands: Float32Array; complete: boolean }> = [];

    const peaks = await extractWaveformPeaks(descriptor, 0, 1, 3, {
      pointsPerChunk: 2,
      shouldStop: () => false,
      onProgress: (chunk) => progress.push(chunk),
    });

    expect(peaks).toEqual(new Float32Array(6));
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({ pointOffset: 0, complete: true });
    expect(progress[0]!.peaks).toEqual(new Float32Array(6));
    expect(progress[0]!.bands).toEqual(new Float32Array(12));
    expect(opened.dispose).toHaveBeenCalledOnce();
  });

  it('publishes ordered progress chunks with bands and completes a short final tail', async () => {
    const opened = openedInput({ canDecode: vi.fn().mockResolvedValue(true) });
    openMediaInput.mockResolvedValue(opened);
    sinkSamples.mockImplementation(async function* () {
      for (const startFrame of [0, 16, 32, 48]) {
        const frameCount = startFrame === 48 ? 8 : 16;
        yield audioSample([Array.from({ length: frameCount }, () => 0.5)], 64, startFrame / 64);
      }
    });
    const progress: Array<{ pointOffset: number; peaks: Float32Array; bands: Float32Array; complete: boolean }> = [];

    await extractWaveformPeaks(descriptor, 0, 1, 64, {
      pointsPerChunk: 16,
      shouldStop: () => false,
      onProgress: (chunk) => progress.push(chunk),
    });

    expect(progress.map(({ pointOffset }) => pointOffset)).toEqual([0, 16, 32, 48]);
    expect(progress.map(({ peaks }) => peaks.length / 2)).toEqual([16, 16, 16, 16]);
    expect(progress.map(({ bands }) => bands.length / 4)).toEqual([16, 16, 16, 16]);
    expect(progress.map(({ complete }) => complete)).toEqual([false, false, false, true]);
    expect(Array.from(progress[3]!.peaks.slice(0, 16))).toEqual(Array.from({ length: 8 }, () => [0, 0.5]).flat());
    expect(progress[3]!.peaks.slice(16)).toEqual(new Float32Array(16));
    expect(progress[3]!.bands.slice(32)).toEqual(new Float32Array(32));
  });

  it('keeps spectral bands across sample-rate changes and flushes the preceding sample rate', async () => {
    const opened = openedInput({ canDecode: vi.fn().mockResolvedValue(true) });
    openMediaInput.mockResolvedValue(opened);
    const lowRate = audioSample([sine(800, 8_000, 100)], 8_000, 0);
    const highRate = audioSample([sine(1_600, 16_000, 6_000)], 16_000, 0.1);
    sinkSamples.mockImplementation(async function* () {
      yield lowRate;
      yield highRate;
    });
    const progress: Array<{ bands: Float32Array; complete: boolean }> = [];

    await extractWaveformPeaks(descriptor, 0, 0.2, 2, {
      pointsPerChunk: 2,
      shouldStop: () => false,
      onProgress: ({ bands, complete }) => progress.push({ bands, complete }),
    });

    expect(progress).toHaveLength(1);
    expect(progress[0]!.complete).toBe(true);
    const bands = progress[0]!.bands;
    expect(bands[0]).toBeGreaterThan(bands[3]!);
    expect(bands[7]).toBeGreaterThan(bands[4]!);
    expect(lowRate.close).toHaveBeenCalledOnce();
    expect(highRate.close).toHaveBeenCalledOnce();
  });

  it('stops between samples, closes each acquired sample, and leaves the unprocessed tail empty', async () => {
    const opened = openedInput({ canDecode: vi.fn().mockResolvedValue(true) });
    const first = audioSample([[0.25]], 2, 0);
    const second = audioSample([[-0.5]], 2, 0.5);
    openMediaInput.mockResolvedValue(opened);
    sinkSamples.mockImplementation(async function* () {
      yield first;
      yield second;
    });
    let checks = 0;
    const progress: Array<{ pointOffset: number; complete: boolean }> = [];

    const peaks = await extractWaveformPeaks(descriptor, 0, 1, 2, {
      pointsPerChunk: 1,
      shouldStop: () => checks++ > 0,
      onProgress: ({ pointOffset, complete }) => progress.push({ pointOffset, complete }),
    });

    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).toHaveBeenCalledOnce();
    expect(peaks).toEqual(new Float32Array([0, 0.25, 0, 0]));
    expect(progress).toEqual([{ pointOffset: 0, complete: false }]);
    expect(opened.dispose).toHaveBeenCalledOnce();
  });

  it('rejects invalid ranges, point counts and chunk sizes before opening media', async () => {
    await expect(extractWaveformPeaks(descriptor, -1, 1, 4)).rejects.toThrow(RangeError);
    await expect(extractWaveformPeaks(descriptor, 0, 0, 4)).rejects.toThrow(RangeError);
    await expect(extractWaveformPeaks(descriptor, Number.NaN, 1, 4)).rejects.toThrow(RangeError);
    await expect(extractWaveformPeaks(descriptor, 0, 1, 0)).rejects.toThrow(RangeError);
    await expect(extractWaveformPeaks(descriptor, 0, 1, 1.5)).rejects.toThrow(RangeError);
    await expect(
      extractWaveformPeaks(descriptor, 0, 1, 4, {
        pointsPerChunk: 0,
        shouldStop: () => false,
        onProgress: () => undefined,
      }),
    ).rejects.toThrow(RangeError);
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

  it('reports unsupported codecs and closes acquired samples when decoding fails', async () => {
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
    const sample = audioSample([[0.5]], 4);
    sample.copyTo.mockImplementation(() => {
      throw new Error('sample decode failed');
    });
    openMediaInput.mockResolvedValueOnce(failing);
    sinkSamples.mockImplementation(async function* () {
      yield sample;
    });

    await expect(extractWaveformPeaks(descriptor, 0, 1, 4)).rejects.toThrow('sample decode failed');
    expect(sample.close).toHaveBeenCalledOnce();
    expect(failing.dispose).toHaveBeenCalledOnce();
  });

  it('disposes the opened input when the sequential sample iterator fails', async () => {
    const opened = openedInput({ canDecode: vi.fn().mockResolvedValue(true) });
    const sample = audioSample([[0.5]], 4);
    openMediaInput.mockResolvedValue(opened);
    sinkSamples.mockImplementation(async function* () {
      yield sample;
      throw new Error('decoder failed');
    });

    await expect(extractWaveformPeaks(descriptor, 0, 1, 4)).rejects.toThrow('decoder failed');
    expect(sample.close).toHaveBeenCalledOnce();
    expect(opened.dispose).toHaveBeenCalledOnce();
  });
});
