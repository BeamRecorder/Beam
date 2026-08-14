import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPlaybackScheduler } from '../audio-scheduler';
import { MediaInputError, type AudioClip, type ClipComposition } from '../../shared';

const runtime = vi.hoisted(() => ({
  openMediaInput: vi.fn(),
  mediaSourceDescriptor: vi.fn(),
  buffersFactory: vi.fn(),
}));

vi.mock('mediabunny', async () => {
  const actual = await vi.importActual<typeof import('mediabunny')>('mediabunny');
  return {
    ...actual,
    AudioBufferSink: class AudioBufferSink {
      readonly buffers = vi.fn((start: number, end: number) => runtime.buffersFactory(start, end));

      constructor(track: unknown) {
        void track;
      }
    },
  };
});

vi.mock('../../shared', async () => {
  const actual = await vi.importActual<typeof import('../../shared')>('../../shared');
  return {
    ...actual,
    openMediaInput: runtime.openMediaInput,
    mediaSourceDescriptor: runtime.mediaSourceDescriptor,
  };
});

type FakeSource = {
  buffer: AudioBuffer | null;
  playbackRate: { value: number };
  onended: (() => void) | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

type FakeCompressor = {
  threshold: { value: number };
  knee: { value: number };
  ratio: { value: number };
  attack: { value: number };
  release: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: AudioContextState = 'running';
  now = 0;
  readonly destination = {} as AudioNode;
  readonly close = vi.fn(async () => undefined);
  readonly resume = vi.fn(async () => undefined);
  readonly gains: Array<{
    gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];
  readonly compressors: FakeCompressor[] = [];
  readonly sources: FakeSource[] = [];

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  get currentTime() {
    return this.now;
  }

  createGain() {
    const gain = {
      gain: { value: 1, setTargetAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }

  createDynamicsCompressor() {
    const compressor: FakeCompressor = {
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 1 },
      attack: { value: 0 },
      release: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    this.compressors.push(compressor);
    return compressor as unknown as DynamicsCompressorNode;
  }

  createBufferSource() {
    const source: FakeSource = {
      buffer: null,
      playbackRate: { value: 1 },
      onended: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
}

const asset = (id = 'audio-1') => ({
  id,
  kind: 'audio' as const,
  name: id,
  fileName: `${id}.wav`,
  durationMs: 10_000,
  width: null,
  height: null,
  src: `https://cdn.example.test/${id}.wav`,
  origin: 'project' as const,
});

const clip = (id: string, overrides: Partial<AudioClip> = {}): AudioClip => ({
  id,
  kind: 'audio',
  name: id,
  assetId: 'audio-1',
  role: 'imported',
  timelineStartMs: 0,
  timelineDurationMs: 3_000,
  sourceInMs: 0,
  sourceDurationMs: 3_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  volume: 100,
  ...overrides,
});

const composition = (clips: AudioClip[] = [clip('clip-1')], assets = [asset()]): ClipComposition => ({
  schemaVersion: 3,
  keyboardCaptionSessions: [],
  assets,
  clips,
});

const iterator = (chunks: Array<{ timestamp: number; duration: number }>) => {
  let index = 0;
  return {
    next: vi.fn(async () => {
      const value = chunks[index++];
      return value ? { done: false, value: { ...value, buffer: { id: index } } } : { done: true, value: undefined };
    }),
    [Symbol.asyncIterator]() {
      return this;
    },
  };
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const flushMicrotasks = async () => {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
};

const openedInput = (track: unknown = { canDecode: vi.fn(async () => true), getCodec: vi.fn(async () => 'aac') }) => ({
  descriptor: {
    assetId: 'audio-1',
    kind: 'audio' as const,
    url: 'https://cdn.example.test/audio-1.wav',
    label: 'audio-1',
  },
  input: { getPrimaryAudioTrack: vi.fn(async () => track) },
  dispose: vi.fn(),
});

beforeEach(() => {
  vi.useFakeTimers();
  FakeAudioContext.instances = [];
  vi.stubGlobal('AudioContext', FakeAudioContext);
  runtime.mediaSourceDescriptor.mockImplementation((value: { id: string; src: string; name: string }) => ({
    assetId: value.id,
    kind: 'audio',
    url: value.src,
    label: value.name,
  }));
  runtime.openMediaInput.mockImplementation(async () => openedInput());
  runtime.buffersFactory.mockImplementation(() => iterator([{ timestamp: 0, duration: 0.5 }]));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AudioPlaybackScheduler', () => {
  it('decodes chunks sequentially and never schedules past the one-second horizon', async () => {
    const chunks = [
      { timestamp: 0, duration: 0.4 },
      { timestamp: 0.4, duration: 0.4 },
      { timestamp: 0.8, duration: 0.2 },
      { timestamp: 1.1, duration: 0.4 },
    ];
    runtime.buffersFactory.mockImplementation(() => iterator(chunks));
    const scheduler = new AudioPlaybackScheduler();
    await scheduler.loadComposition(composition());
    await scheduler.play(0, 1);
    const context = FakeAudioContext.instances[0]!;
    expect(context.sources).toHaveLength(3);
    expect(context.sources.map((source) => source.start.mock.calls[0]![0])).toEqual([0, 0.4, 0.8]);

    context.now = 1;
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();
    expect(context.sources).toHaveLength(4);
    expect(context.sources[3]!.start.mock.calls[0]![0]).toBeCloseTo(1.1);
    expect(context.sources[3]!.start.mock.calls[0]![1]).toBe(0);
    expect(context.sources[3]!.start.mock.calls[0]![2]).toBeCloseTo(0.4);
    scheduler.dispose();
  });

  it('keeps timer scheduling single-flight when a decoder is slower than the timer cadence', async () => {
    const delayed = deferred<{
      done: false;
      value: { timestamp: number; duration: number; buffer: { id: string } };
    }>();
    const chunks = [
      { timestamp: 0, duration: 0.4 },
      { timestamp: 0.4, duration: 0.4 },
      { timestamp: 0.8, duration: 0.2 },
      { timestamp: 1.1, duration: 0.1 },
    ];
    let nextCalls = 0;
    let inFlight = 0;
    let maximumInFlight = 0;
    let delayedResultReleased = false;
    const scheduleIterator = {
      next: vi.fn(() => {
        const call = nextCalls++;
        const track = <T>(promise: Promise<T>) => {
          inFlight += 1;
          maximumInFlight = Math.max(maximumInFlight, inFlight);
          return promise.finally(() => {
            inFlight -= 1;
          });
        };
        if (call < chunks.length) {
          const chunk = chunks[call]!;
          return track(Promise.resolve({ done: false as const, value: { ...chunk, buffer: { id: String(call) } } }));
        }
        if (!delayedResultReleased) return track(delayed.promise);
        return track(Promise.resolve({ done: true as const, value: undefined }));
      }),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    runtime.buffersFactory.mockImplementation(() => scheduleIterator);

    const scheduler = new AudioPlaybackScheduler();
    await scheduler.loadComposition(composition());
    await scheduler.play(0, 1);

    const context = FakeAudioContext.instances[0]!;
    context.now = 1;
    vi.advanceTimersByTime(100);
    await flushMicrotasks();
    vi.advanceTimersByTime(100);
    await flushMicrotasks();

    expect(maximumInFlight).toBe(1);

    delayedResultReleased = true;
    delayed.resolve({
      done: false,
      value: { timestamp: 1.2, duration: 0.1, buffer: { id: 'delayed' } },
    });
    await flushMicrotasks();

    const startsAtDelayedChunk = context.sources.filter((source) => {
      const startTime = source.start.mock.calls[0]?.[0];
      return typeof startTime === 'number' && Math.abs(startTime - 1.2) < 0.0001;
    });
    expect(startsAtDelayedChunk).toHaveLength(1);
    scheduler.dispose();
  });

  it('applies source trims, timeline offsets, playback rate, clip volume, and master volume', async () => {
    const wrapped = [{ timestamp: 1.5, duration: 1 }];
    runtime.buffersFactory.mockImplementation(() => iterator(wrapped));
    const scheduler = new AudioPlaybackScheduler();
    await scheduler.loadComposition(
      composition([
        clip('trimmed', {
          timelineStartMs: 2_000,
          sourceInMs: 1_000,
          sourceDurationMs: 2_000,
          timelineDurationMs: 1_000,
          playbackRate: 2,
          volume: 150,
        }),
      ]),
    );
    await scheduler.play(2.5, 1);
    const context = FakeAudioContext.instances[0]!;
    const source = context.sources[0]!;
    expect(source.playbackRate.value).toBe(2);
    expect(source.start).toHaveBeenCalledWith(0, 0.5, 0.5);
    expect(context.gains[1]!.gain.value).toBe(1.5);
    scheduler.setVolume(125);
    expect(context.gains[0]!.gain.setTargetAtTime).toHaveBeenCalledWith(1, 0, 0.004);
    scheduler.dispose();
  });

  it('routes monitoring through the configured limiter and disconnects it on dispose', async () => {
    const scheduler = new AudioPlaybackScheduler();
    await scheduler.loadComposition(composition());
    await scheduler.play(0, 1);

    const context = FakeAudioContext.instances[0]!;
    const masterGain = context.gains[0]!;
    const limiter = context.compressors[0]!;
    expect(context.compressors).toHaveLength(1);
    expect(limiter.threshold.value).toBe(-1);
    expect(limiter.knee.value).toBe(0);
    expect(limiter.ratio.value).toBe(20);
    expect(limiter.attack.value).toBe(0.003);
    expect(limiter.release.value).toBe(0.1);
    expect(masterGain.connect).toHaveBeenCalledWith(limiter);
    expect(limiter.connect).toHaveBeenCalledWith(context.destination);

    scheduler.dispose();
    expect(masterGain.disconnect).toHaveBeenCalledOnce();
    expect(limiter.disconnect).toHaveBeenCalledOnce();
  });

  it('handles overlapping clips and waits through gaps until they enter the scheduling window', async () => {
    runtime.buffersFactory.mockImplementation(() => iterator([{ timestamp: 0, duration: 1 }]));
    const scheduler = new AudioPlaybackScheduler();
    await scheduler.loadComposition(
      composition([
        clip('first', { timelineDurationMs: 1_000 }),
        clip('overlap', { timelineStartMs: 500, timelineDurationMs: 1_000 }),
        clip('gap', { timelineStartMs: 2_000, timelineDurationMs: 1_000 }),
      ]),
    );
    await scheduler.play(0, 1);
    const context = FakeAudioContext.instances[0]!;
    expect(context.sources.map((source) => source.start.mock.calls[0]![0])).toEqual([0, 0.5]);
    context.now = 1;
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();
    expect(context.sources.map((source) => source.start.mock.calls[0]![0])).toEqual([0, 0.5, 2]);
    scheduler.dispose();
  });

  it('pauses and seeks by stopping nodes, and disposes decoders, graph, and context', async () => {
    const opened = openedInput();
    runtime.openMediaInput.mockResolvedValue(opened);
    const scheduler = new AudioPlaybackScheduler();
    await scheduler.loadComposition(composition());
    await scheduler.play(0, 1);
    const context = FakeAudioContext.instances[0]!;
    const firstSource = context.sources[0]!;
    scheduler.pause(0.4);
    expect(firstSource.stop).toHaveBeenCalledOnce();
    expect(firstSource.disconnect).toHaveBeenCalled();
    await scheduler.seek(0.4, 2, true);
    expect(context.sources).toHaveLength(2);
    scheduler.dispose();
    expect(opened.dispose).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(context.gains[0]!.disconnect).toHaveBeenCalled();
  });

  it('reports missing assets, missing tracks, and unsupported codecs with cleanup', async () => {
    const missing = new AudioPlaybackScheduler();
    await expect(missing.loadComposition(composition([clip('missing', { assetId: 'absent' })]))).resolves.toEqual([
      expect.objectContaining({ kind: 'missing', sourceId: 'absent' }),
    ]);

    const noTrackOpened = openedInput(null);
    runtime.openMediaInput.mockResolvedValueOnce(noTrackOpened);
    const noTrack = new AudioPlaybackScheduler();
    await expect(noTrack.loadComposition(composition())).resolves.toEqual([
      expect.objectContaining({ kind: 'missing-track', track: 'audio', sourceId: 'audio-1' }),
    ]);
    expect(noTrackOpened.dispose).toHaveBeenCalledOnce();

    const unsupportedTrack = { canDecode: vi.fn(async () => false), getCodec: vi.fn(async () => 'ac-3') };
    const unsupportedOpened = openedInput(unsupportedTrack);
    runtime.openMediaInput.mockResolvedValueOnce(unsupportedOpened);
    const unsupported = new AudioPlaybackScheduler();
    await expect(unsupported.loadComposition(composition())).resolves.toEqual([
      expect.objectContaining({ kind: 'unsupported-codec', codec: 'ac-3', track: 'audio' }),
    ]);
    expect(unsupportedOpened.dispose).toHaveBeenCalledOnce();

    runtime.openMediaInput.mockRejectedValueOnce(
      new MediaInputError({ kind: 'invalid-container', sourceId: 'audio-1', message: 'bad input' }),
    );
    const invalid = new AudioPlaybackScheduler();
    await expect(invalid.loadComposition(composition())).resolves.toEqual([
      expect.objectContaining({ kind: 'invalid-container' }),
    ]);
  });

  it('skips an audio asset with an empty source while loading valid audio', async () => {
    runtime.openMediaInput.mockClear();
    const invalidAsset = { ...asset('missing-audio'), src: '' };
    runtime.mediaSourceDescriptor.mockImplementation((value: { id: string; src: string; name: string }) => {
      if (!value.src) {
        throw new MediaInputError({
          kind: 'missing',
          sourceId: value.id,
          message: 'The media asset is unavailable.',
        });
      }
      return { assetId: value.id, kind: 'audio', url: value.src, label: value.name };
    });
    const scheduler = new AudioPlaybackScheduler();
    const value = composition([clip('valid'), clip('skipped', { assetId: 'missing-audio' })], [asset(), invalidAsset]);

    await expect(scheduler.loadComposition(value)).resolves.toEqual([
      expect.objectContaining({ kind: 'missing', sourceId: 'missing-audio' }),
    ]);
    expect(runtime.openMediaInput).toHaveBeenCalledTimes(1);
    await scheduler.play(0, 1);
    expect(FakeAudioContext.instances[0]!.sources).toHaveLength(1);
    scheduler.dispose();
  });
});
