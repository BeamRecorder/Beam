import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaSourceDescriptor } from '../../shared/media-types';

const { openMediaInput, sinkBuffers, AudioBufferSink, MediaInputError } = vi.hoisted(() => {
  class TestMediaInputError extends Error {
    detail: unknown;

    constructor(detail: unknown) {
      super((detail as { message: string }).message);
      this.name = 'MediaInputError';
      this.detail = detail;
    }
  }

  class TestAudioBufferSink {
    constructor(track: unknown) {
      void track;
    }

    buffers(...args: unknown[]) {
      return sinkBuffers(...args);
    }
  }

  return {
    openMediaInput: vi.fn(),
    sinkBuffers: vi.fn(),
    AudioBufferSink: TestAudioBufferSink,
    MediaInputError: TestMediaInputError,
  };
});

vi.mock('../../shared', () => ({ openMediaInput, MediaInputError }));
vi.mock('mediabunny', () => ({ AudioBufferSink }));

import { extractWaveformPeaks } from '../waveform';

const descriptor: MediaSourceDescriptor = {
  assetId: 'audio-1',
  kind: 'audio',
  label: 'Audio',
  url: 'project-media://asset/audio-1',
};

const audioBuffer = (channels: number[][], sampleRate: number) => ({
  sampleRate,
  length: channels[0]?.length ?? 0,
  numberOfChannels: channels.length,
  getChannelData: (channel: number) => Float32Array.from(channels[channel] ?? []),
});

const openedInput = (track: unknown) => ({
  input: { getPrimaryAudioTrack: vi.fn().mockResolvedValue(track) },
  dispose: vi.fn(),
});

beforeEach(() => {
  openMediaInput.mockReset();
  sinkBuffers.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('extractWaveformPeaks', () => {
  it('trims decoded buffers to the requested range and aggregates bounded min/max bins', async () => {
    const track = { canDecode: vi.fn().mockResolvedValue(true) };
    const opened = openedInput(track);
    openMediaInput.mockResolvedValue(opened);
    sinkBuffers.mockImplementation(async function* (start: number, end: number) {
      expect(start).toBe(1);
      expect(end).toBe(3);
      yield {
        timestamp: 0,
        duration: 3,
        buffer: audioBuffer([[0.1, 0.3, 0.8, -0.8, 0.4, 0.6, -0.2, 0.2, 1, -1]], 4),
      };
    });

    const peaks = await extractWaveformPeaks(descriptor, 1, 3, 2);

    expect(peaks).toEqual(new Float32Array([-0.2, 0.6, -1, 1]));
    expect(openMediaInput).toHaveBeenCalledWith({ ...descriptor, kind: 'audio' });
    expect(opened.dispose).toHaveBeenCalledOnce();
    expect(peaks.length).toBe(4);
  });

  it('averages channels while retaining the sample range in each bin', async () => {
    const opened = openedInput({ canDecode: vi.fn().mockResolvedValue(true) });
    openMediaInput.mockResolvedValue(opened);
    sinkBuffers.mockImplementation(async function* () {
      yield {
        timestamp: 0,
        duration: 1,
        buffer: audioBuffer(
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
    sinkBuffers.mockImplementation(async function* () {
      throw new Error('decoder failed');
    });
    await expect(extractWaveformPeaks(descriptor, 0, 1, 4)).rejects.toThrow('decoder failed');
    expect(failing.dispose).toHaveBeenCalledOnce();
  });
});
