import { describe, expect, it, vi } from 'vitest';
import type { AudioClip } from '../../shared/composition-types';
import type { InputAudioTrack } from 'mediabunny';
import { createProgressiveAudioMixer, stereoSample } from '../pcm-mixer';

const runtime = vi.hoisted(() => {
  class TestAudioSample {
    static readonly created: TestAudioSample[] = [];
    readonly data: AllowSharedBufferSource;
    readonly format: string;
    readonly numberOfChannels: number;
    readonly sampleRate: number;
    readonly timestamp: number;
    readonly numberOfFrames: number;
    readonly duration: number;
    readonly close = vi.fn();

    constructor(init: {
      data: AllowSharedBufferSource;
      format: string;
      numberOfChannels: number;
      sampleRate: number;
      timestamp: number;
    }) {
      this.data = init.data;
      this.format = init.format;
      this.numberOfChannels = init.numberOfChannels;
      this.sampleRate = init.sampleRate;
      this.timestamp = init.timestamp;
      this.numberOfFrames = (init.data as Float32Array).length / init.numberOfChannels;
      this.duration = this.numberOfFrames / init.sampleRate;
      TestAudioSample.created.push(this);
    }
  }

  class TestAudioSampleSink {
    private readonly track: { samples: (...args: unknown[]) => AsyncIterable<unknown> };

    constructor(track: { samples: (...args: unknown[]) => AsyncIterable<unknown> }) {
      this.track = track;
    }

    samples(...args: unknown[]) {
      return this.track.samples(...args);
    }
  }

  return { TestAudioSample, TestAudioSampleSink };
});

vi.mock('mediabunny', () => ({
  AudioSample: runtime.TestAudioSample,
  AudioSampleSink: runtime.TestAudioSampleSink,
}));

type InputSample = {
  numberOfChannels: number;
  numberOfFrames: number;
  sampleRate: number;
  timestamp: number;
  duration: number;
  copyTo: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

const inputSample = (channels: readonly number[][], sampleRate: number, timestamp = 0): InputSample => {
  const numberOfFrames = channels[0]?.length ?? 0;
  return {
    numberOfChannels: channels.length,
    numberOfFrames,
    sampleRate,
    timestamp,
    duration: numberOfFrames / sampleRate,
    copyTo: vi.fn((destination: Float32Array, options: { planeIndex: number }) => {
      destination.set(Float32Array.from(channels[options.planeIndex] ?? []));
    }),
    close: vi.fn(),
  };
};

const iterator = (samples: readonly InputSample[]) => {
  let index = 0;
  return {
    next: vi.fn(async () => {
      const sample = samples[index++];
      return sample ? { done: false as const, value: sample } : { done: true as const, value: undefined };
    }),
    [Symbol.asyncIterator]() {
      return this;
    },
  };
};

const track = (...samples: InputSample[]) => {
  const source = iterator(samples);
  return {
    samples: vi.fn(() => source),
  } as unknown as InputAudioTrack & { samples: ReturnType<typeof vi.fn> };
};

const clip = (id: string, assetId: string, overrides: Partial<AudioClip> = {}): AudioClip => ({
  id,
  kind: 'audio',
  name: id,
  assetId,
  role: 'imported',
  timelineStartMs: 0,
  timelineDurationMs: 1,
  sourceInMs: 0,
  sourceDurationMs: 1,
  playbackRate: 1,
  enabled: true,
  order: 0,
  volume: 100,
  ...overrides,
});

const outputValues = (sample: InstanceType<typeof runtime.TestAudioSample>) => Array.from(sample.data as Float32Array);

describe('progressive PCM export mixer', () => {
  it('maps mono, stereo, quad, and 5.1 layouts to stereo', () => {
    expect(stereoSample([Float32Array.of(0.25)], 0)).toEqual([0.25, 0.25]);
    expect(stereoSample([Float32Array.of(0.25), Float32Array.of(-0.5)], 0)).toEqual([0.25, -0.5]);
    expect(
      stereoSample([Float32Array.of(1), Float32Array.of(-1), Float32Array.of(0.5), Float32Array.of(-0.5)], 0),
    ).toEqual([0.75, -0.75]);

    const center = Math.SQRT1_2;
    expect(
      stereoSample(
        [
          Float32Array.of(0.2),
          Float32Array.of(0.4),
          Float32Array.of(0.5),
          Float32Array.of(0.9),
          Float32Array.of(0.1),
          Float32Array.of(-0.3),
        ],
        0,
      ),
    ).toEqual([expect.closeTo(0.2 + center * 0.6, 8), expect.closeTo(0.4 + center * 0.2, 8)]);
  });

  it('applies source trim, timeline placement, volume, and leaves gaps silent', async () => {
    const sample = inputSample([new Array(48).fill(0.5)], 48_000, 0.001);
    const source = track(sample);
    const mixer = createProgressiveAudioMixer(
      [
        clip('trimmed', 'asset', {
          timelineStartMs: 0,
          timelineDurationMs: 1,
          sourceInMs: 1,
          sourceDurationMs: 1,
          volume: 50,
        }),
      ],
      new Map([['asset', source]]),
      0.002,
    );

    const result = await mixer.mixBlock(0, new AbortController().signal);
    const values = outputValues(result as unknown as InstanceType<typeof runtime.TestAudioSample>);
    expect(values.slice(0, 4)).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(values).toHaveLength(192);
    expect(values.slice(96).every((value) => value === 0)).toBe(true);
    expect(source.samples).toHaveBeenCalledWith(0.001, 0.002, { skipLiveWait: true });
    expect(sample.close).toHaveBeenCalledOnce();
  });

  it('resamples with linear interpolation and supports playback rate', async () => {
    const sample = inputSample([[0, 1, 0]], 24_000, 0);
    const mixer = createProgressiveAudioMixer(
      [
        clip('fast', 'asset', {
          timelineDurationMs: 0.0625,
          sourceDurationMs: 0.125,
          playbackRate: 2,
        }),
      ],
      new Map([['asset', track(sample)]]),
      0.0000625,
    );

    const result = await mixer.mixBlock(0, new AbortController().signal);
    const values = outputValues(result as unknown as InstanceType<typeof runtime.TestAudioSample>);
    expect(values).toEqual([0, 0, 1, 1, 0, 0]);
  });

  it.each([
    { rate: 0.25, source: [0, 1, 0, -1, 0], expected: [0, 0, 0.25, 0.25, 0.5, 0.5, 0.75, 0.75] },
    { rate: 4, source: [0, 0, 0, 0, 1], expected: [0, 0, 1, 1] },
  ])('supports the playback-rate boundary $rate×', async ({ rate, source, expected }) => {
    const mixer = createProgressiveAudioMixer(
      [clip('rate', 'asset', { playbackRate: rate, timelineDurationMs: 1, sourceDurationMs: 1 })],
      new Map([['asset', track(inputSample([source], 48_000))]]),
      expected.length / 2 / 48_000,
    );

    const result = await mixer.mixBlock(0, new AbortController().signal);
    expect(outputValues(result as unknown as InstanceType<typeof runtime.TestAudioSample>)).toEqual(expected);
  });

  it('closes a decoded sample and aborts when cancellation happens during decoding', async () => {
    const sample = inputSample([[0.5]], 48_000);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const source = {
      samples: vi.fn(() => ({
        async next() {
          await pending;
          return { done: false as const, value: sample };
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      })),
    } as unknown as InputAudioTrack;
    const controller = new AbortController();
    const mixer = createProgressiveAudioMixer([clip('cancel', 'asset')], new Map([['asset', source]]), 1 / 48_000);
    const running = mixer.mixBlock(0, controller.signal);

    controller.abort();
    release();

    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    expect(sample.close).toHaveBeenCalledOnce();
  });

  it('mixes overlaps, applies per-clip volume, and clamps the final stereo samples', async () => {
    const first = inputSample([[0.75]], 48_000);
    const second = inputSample([[0.75]], 48_000);
    const mixer = createProgressiveAudioMixer(
      [clip('first', 'first'), clip('second', 'second', { volume: 50 })],
      new Map([
        ['first', track(first)],
        ['second', track(second)],
      ]),
      1 / 48_000,
    );

    const result = await mixer.mixBlock(0, new AbortController().signal);
    const values = outputValues(result as unknown as InstanceType<typeof runtime.TestAudioSample>);
    expect(values).toEqual([1, 1]);
    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).toHaveBeenCalledOnce();
  });
});
