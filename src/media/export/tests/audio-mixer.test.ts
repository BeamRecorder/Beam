import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mixCompositionAudio } from '../audio-mixer';
import type { ClipComposition } from '../../shared';

const runtime = vi.hoisted(() => ({
  openMediaInput: vi.fn(),
  mediaSourceDescriptor: vi.fn((asset: { id: string; kind: string; src: string; name: string }) => ({
    assetId: asset.id,
    kind: asset.kind,
    label: asset.name,
    url: asset.src,
  })),
  buffersFactory: vi.fn(),
  sinks: [] as unknown[],
}));

vi.mock('mediabunny', async () => {
  const actual = await vi.importActual<typeof import('mediabunny')>('mediabunny');
  return {
    ...actual,
    AudioBufferSink: class AudioBufferSink {
      readonly buffers = vi.fn((start: number, end: number) => runtime.buffersFactory(start, end));

      constructor(track: unknown) {
        void track;
        runtime.sinks.push(this);
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
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
};

class FakeOfflineContext {
  readonly destination = {} as AudioNode;
  readonly sources: FakeSource[] = [];
  readonly gains: Array<{ gain: { value: number }; connect: ReturnType<typeof vi.fn> }> = [];
  readonly channels: number;
  readonly frames: number;
  readonly sampleRate: number;

  constructor(channels: number, frames: number, sampleRate: number) {
    this.channels = channels;
    this.frames = frames;
    this.sampleRate = sampleRate;
  }

  createBufferSource() {
    const source: FakeSource = {
      buffer: null,
      playbackRate: { value: 1 },
      connect: vi.fn((node: unknown) => node),
      start: vi.fn(),
    };
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  createGain() {
    const gain = { gain: { value: 1 }, connect: vi.fn((node: unknown) => node) };
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }

  startRendering = vi.fn(async () => ({ id: 'mixed' }) as unknown as AudioBuffer);
}

const asset = (id = 'audio-1') => ({
  id,
  kind: 'audio' as const,
  name: id,
  fileName: `${id}.wav`,
  durationMs: 20_000,
  width: null,
  height: null,
  src: `project-media://asset/${id}`,
  origin: 'project' as const,
});

const clip = (id: string, assetId = 'audio-1', overrides: Record<string, unknown> = {}) => ({
  id,
  kind: 'audio' as const,
  name: id,
  assetId,
  role: 'imported' as const,
  timelineStartMs: 3_000,
  timelineDurationMs: 2_000,
  sourceInMs: 2_000,
  sourceDurationMs: 4_000,
  playbackRate: 2,
  enabled: true,
  order: 0,
  volume: 50,
  ...overrides,
});

const composition = (clips: ReturnType<typeof clip>[], assets = [asset()]): ClipComposition => ({
  schemaVersion: 2,
  assets,
  clips,
});

const buffers = (...values: Array<{ timestamp: number; duration: number }>) => {
  let index = 0;
  return {
    async next() {
      const value = values[index++];
      return value
        ? { done: false as const, value: { ...value, buffer: { id: index } as unknown as AudioBuffer } }
        : { done: true as const, value: undefined };
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
};

const opened = (track: unknown = { canDecode: vi.fn(async () => true), getCodec: vi.fn(async () => 'aac') }) => ({
  input: { getPrimaryAudioTrack: vi.fn(async () => track) },
  dispose: vi.fn(),
});

let contexts: FakeOfflineContext[];

beforeEach(() => {
  contexts = [];
  runtime.sinks.length = 0;
  runtime.openMediaInput.mockReset();
  runtime.mediaSourceDescriptor.mockClear();
  runtime.buffersFactory.mockReset().mockImplementation(() => buffers({ timestamp: 1, duration: 10 }));
  runtime.openMediaInput.mockImplementation(async () => opened());
});

afterEach(() => vi.restoreAllMocks());

const contextFactory = (channels: number, frames: number, sampleRate: number) => {
  const context = new FakeOfflineContext(channels, frames, sampleRate);
  contexts.push(context);
  return context as unknown as OfflineAudioContext;
};

describe('mixCompositionAudio', () => {
  it('decodes each unique asset once and applies trim, timeline offset, rate, and volume', async () => {
    const result = await mixCompositionAudio(
      composition([clip('first'), clip('second', 'audio-1', { timelineStartMs: 0, volume: 200 })]),
      8,
      { sampleRate: 48_000, contextFactory },
    );

    expect(result).toMatchObject({ id: 'mixed' });
    expect(runtime.openMediaInput).toHaveBeenCalledOnce();
    expect(runtime.buffersFactory).toHaveBeenCalledWith(2, 6);
    const context = contexts[0]!;
    expect(context.sources).toHaveLength(2);
    expect(context.sources[0]!.playbackRate.value).toBe(2);
    expect(context.sources[0]!.start).toHaveBeenCalledWith(3, 1, 4);
    expect(context.gains[0]!.gain.value).toBe(0.5);
    expect(context.gains[1]!.gain.value).toBe(2);
    const firstOpened = await runtime.openMediaInput.mock.results[0]!.value;
    expect(firstOpened.dispose).toHaveBeenCalledOnce();
  });

  it('skips non-overlapping audio buffers and disposes decoders after rendering', async () => {
    const openedInput = opened();
    runtime.openMediaInput.mockResolvedValueOnce(openedInput);
    runtime.buffersFactory.mockReturnValue(buffers({ timestamp: 0, duration: 1 }, { timestamp: 10, duration: 1 }));

    await mixCompositionAudio(
      composition([clip('first', 'audio-1', { sourceInMs: 2_000, sourceDurationMs: 2_000 })]),
      8,
      {
        contextFactory,
      },
    );

    expect(contexts[0]!.sources).toHaveLength(0);
    expect(openedInput.dispose).toHaveBeenCalledOnce();
  });

  it('returns null without opening a decoder when there are no enabled audio clips', async () => {
    await expect(
      mixCompositionAudio(composition([clip('disabled', 'audio-1', { enabled: false })]), 2, { contextFactory }),
    ).resolves.toBeNull();
    expect(runtime.openMediaInput).not.toHaveBeenCalled();
    expect(contexts).toHaveLength(0);
  });

  it('reports unsupported tracks and still disposes an input when opening fails', async () => {
    const unsupported = opened({ canDecode: vi.fn(async () => false), getCodec: vi.fn(async () => 'flac') });
    runtime.openMediaInput.mockResolvedValueOnce(unsupported);
    await expect(mixCompositionAudio(composition([clip('first')]), 2, { contextFactory })).rejects.toMatchObject({
      detail: { kind: 'unsupported-codec', codec: 'flac' },
    });
    expect(unsupported.dispose).toHaveBeenCalledOnce();
  });

  it('rejects missing assets and disposes already-open decoders on later failures', async () => {
    const first = opened();
    runtime.openMediaInput.mockResolvedValueOnce(first);
    await expect(
      mixCompositionAudio(composition([clip('first'), clip('missing', 'does-not-exist')]), 2, { contextFactory }),
    ).rejects.toMatchObject({ detail: { kind: 'missing' } });
    expect(first.dispose).toHaveBeenCalledOnce();
  });
});
