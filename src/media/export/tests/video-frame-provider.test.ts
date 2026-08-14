import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoFrameProvider } from '../video-frame-provider';

const runtime = vi.hoisted(() => ({
  track: null as { canDecode: () => Promise<boolean>; getCodec: () => Promise<string> } | null,
  iteratorFactory: vi.fn(),
  opened: null as { dispose: ReturnType<typeof vi.fn>; input: unknown } | null,
  sinks: [] as Array<{ options: unknown }>,
}));

vi.mock('mediabunny', async () => {
  const actual = await vi.importActual<typeof import('mediabunny')>('mediabunny');
  return {
    ...actual,
    CanvasSink: class CanvasSink {
      readonly options: unknown;

      readonly canvasesAtTimestamps = vi.fn((timestamps: readonly number[]) => {
        return runtime.iteratorFactory(timestamps);
      });

      constructor(track: unknown, options: unknown) {
        void track;
        this.options = options;
        runtime.sinks.push(this);
      }
    },
  };
});

vi.mock('../../shared', async () => {
  const actual = await vi.importActual<typeof import('../../shared')>('../../shared');
  return {
    ...actual,
    openMediaInput: vi.fn(async () => runtime.opened),
  };
});

const descriptor = {
  assetId: 'video-1',
  kind: 'video' as const,
  label: 'Video 1',
  url: 'project-media://asset/video-1',
};

class FakeImageBitmap {
  readonly close = vi.fn();
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
}

type WrappedCanvas = {
  canvas: { transferToImageBitmap: ReturnType<typeof vi.fn> };
  timestamp: number;
  duration: number;
};

const iteratorFor = (values: WrappedCanvas[]) => {
  let index = 0;
  return {
    next: vi.fn(async () =>
      index < values.length ? { done: false, value: values[index++] } : { done: true, value: undefined },
    ),
    [Symbol.asyncIterator]() {
      return this;
    },
  };
};

const wrapped = (timestamp: number, id: number, width = 1920, height = 1080): WrappedCanvas => {
  void id;
  const bitmap = new FakeImageBitmap(width, height);
  return {
    canvas: { transferToImageBitmap: vi.fn(() => bitmap) },
    timestamp,
    duration: 1 / 60,
  };
};

beforeEach(() => {
  vi.stubGlobal('ImageBitmap', FakeImageBitmap);
  runtime.track = { canDecode: vi.fn(async () => true), getCodec: vi.fn(async () => 'avc1.640028') };
  runtime.opened = {
    dispose: vi.fn(),
    input: { getPrimaryVideoTrack: vi.fn(async () => runtime.track) },
  };
  runtime.iteratorFactory.mockReset();
  runtime.sinks.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('VideoFrameProvider', () => {
  it('uses CanvasSink with a bounded pool, transfers bitmaps, and owns returned frames', async () => {
    const first = wrapped(0, 1);
    const skipped = wrapped(1, 2);
    const third = wrapped(2, 3, 1280, 720);
    const iterator = iteratorFor([first, skipped, third]);
    runtime.iteratorFactory.mockReturnValue(iterator);

    const provider = await VideoFrameProvider.create(descriptor, [0, 1, 2]);
    expect(runtime.sinks[0]!.options).toEqual({ poolSize: 3 });
    const frame = await provider.frameAt(0);
    expect(first.canvas.transferToImageBitmap).toHaveBeenCalledOnce();
    expect(frame).toMatchObject({
      clipId: 'video-1',
      timestampSeconds: 0,
      durationSeconds: 1 / 60,
      width: 1920,
      height: 1080,
      byteSize: 1920 * 1080 * 4,
    });
    frame.close();
    frame.close();
    expect((frame.bitmap as unknown as FakeImageBitmap).close).toHaveBeenCalledOnce();

    const latest = await provider.frameAt(2);
    expect(skipped.canvas.transferToImageBitmap).not.toHaveBeenCalled();
    expect(third.canvas.transferToImageBitmap).toHaveBeenCalledOnce();
    expect(latest.width).toBe(1280);
    expect(latest.height).toBe(720);
    latest.close();
    expect(runtime.iteratorFactory).toHaveBeenCalledOnce();
    expect(runtime.iteratorFactory).toHaveBeenCalledWith([0, 1, 2]);

    provider.dispose();
    provider.dispose();
    expect(runtime.opened!.dispose).toHaveBeenCalledOnce();
  });

  it('resets the CanvasSink iterator when a timestamp loop decreases', async () => {
    const firstPass = iteratorFor([wrapped(0, 1), wrapped(2, 2)]);
    const secondPass = iteratorFor([wrapped(1, 3), wrapped(3, 4)]);
    runtime.iteratorFactory.mockReturnValueOnce(firstPass).mockReturnValueOnce(secondPass);

    const provider = await VideoFrameProvider.create(descriptor, [0, 2, 1, 3]);
    const firstFrame = await provider.frameAt(0);
    firstFrame.close();
    const secondFrame = await provider.frameAt(1);
    secondFrame.close();
    const resetFrame = await provider.frameAt(2);

    expect(runtime.iteratorFactory).toHaveBeenCalledTimes(2);
    expect(runtime.iteratorFactory).toHaveBeenNthCalledWith(1, [0, 2, 1, 3]);
    expect(runtime.iteratorFactory).toHaveBeenNthCalledWith(2, [1, 3]);
    expect(resetFrame.timestampSeconds).toBe(1);
    resetFrame.close();
  });

  it('fails explicitly for missing tracks, unsupported codecs, and missing decoded frames', async () => {
    runtime.opened!.input = { getPrimaryVideoTrack: vi.fn(async () => null) };
    await expect(VideoFrameProvider.create(descriptor, [0])).rejects.toMatchObject({
      detail: { kind: 'missing-track', sourceId: 'video-1' },
    });
    expect(runtime.opened!.dispose).toHaveBeenCalledOnce();

    runtime.opened = {
      dispose: vi.fn(),
      input: {
        getPrimaryVideoTrack: vi.fn(async () => ({ canDecode: vi.fn(async () => false), getCodec: vi.fn(async () => 'hevc') })),
      },
    };
    await expect(VideoFrameProvider.create(descriptor, [0])).rejects.toMatchObject({
      detail: { kind: 'unsupported-codec', codec: 'hevc' },
    });
    expect(runtime.opened.dispose).toHaveBeenCalledOnce();

    runtime.opened = {
      dispose: vi.fn(),
      input: { getPrimaryVideoTrack: vi.fn(async () => runtime.track) },
    };
    runtime.iteratorFactory.mockReturnValue(iteratorFor([]));
    const provider = await VideoFrameProvider.create(descriptor, [0]);
    await expect(provider.frameAt(0)).rejects.toMatchObject({ detail: { kind: 'decode-failure' } });
    provider.dispose();
  });

  it('validates kind and timestamps before opening the input', async () => {
    await expect(VideoFrameProvider.create({ ...descriptor, kind: 'audio' }, [0])).rejects.toMatchObject({
      detail: { kind: 'missing-track' },
    });
    await expect(VideoFrameProvider.create(descriptor, [0, -1])).rejects.toThrow(/timestamps/);
    await expect(VideoFrameProvider.create(descriptor, [Number.NaN])).rejects.toThrow(/timestamps/);
  });
});
