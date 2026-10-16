import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addHoverRange, analyzeCursorHovers } from './hover-analysis';
import type { CursorHoverRange } from '@beam/engine/cursor/cursor-hover-types';

const state = vi.hoisted(() => ({
  frames: [] as Array<{ timestamp: number; canvas: { width: number; height: number } } | null>,
  dispose: vi.fn(),
  gpuDispose: vi.fn(),
  reset: vi.fn(),
  sample: vi.fn(),
  sinkOptions: null as unknown,
  track: { canDecode: vi.fn(), getDisplayWidth: vi.fn(), getDisplayHeight: vi.fn(), getCodec: vi.fn() },
  getTrack: vi.fn(),
  failFrame: false,
}));
vi.mock('../../shared/media-input', () => ({
  openMediaInput: vi.fn(async (_descriptor, _pool, signal: AbortSignal) => {
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      signal.removeEventListener('abort', dispose);
      state.dispose();
    };
    signal.addEventListener('abort', dispose, { once: true });
    return { input: { getPrimaryVideoTrack: state.getTrack }, dispose };
  }),
}));
vi.mock('./hover-frames', () => ({
  async *uniqueHoverFrames(
    _track: unknown,
    times: Iterable<number>,
    size: unknown,
    decoderOptions: unknown,
    check: () => void,
  ) {
    state.sinkOptions = { size, decoderOptions };
    expect([...times].length).toBeGreaterThan(0);
    for (const frame of state.frames) {
      check();
      if (state.failFrame) throw new Error('decode failed');
      if (!frame) throw new Error('A recorded screen frame is missing during cursor synchronization.');
      yield frame;
    }
  },
}));
vi.mock('./hover-difference-gpu', () => ({
  HoverDifferenceGpu: class {
    sample = state.sample;
    reset = state.reset;
    dispose = state.gpuDispose;
  },
}));

const input = () => ({
  sources: [{ id: 'screen', src: 'https://localhost/screen.mp4', startSeconds: 5, durationSeconds: 1 }],
  path: new Float64Array([5, 0.5, 0.1, 1, 5.1, 0.5, 0.8, 1, 5.5, 0.8, 0.8, 1]),
});
const frame = (timestamp: number) => ({ timestamp, canvas: { width: 384, height: 216 } });
beforeEach(() => {
  vi.clearAllMocks();
  state.dispose.mockReset();
  state.failFrame = false;
  state.getTrack.mockResolvedValue(state.track);
  state.track.canDecode.mockResolvedValue(true);
  state.track.getDisplayWidth.mockResolvedValue(1920);
  state.track.getDisplayHeight.mockResolvedValue(1080);
  state.track.getCodec.mockResolvedValue('vp9');
  state.frames = [frame(0), frame(1 / 60), frame(2 / 60)];
  const pixels = new Uint8Array(64 * 36 * 4);
  for (let y = 7; y <= 9; y++) for (let x = 15; x < 45; x++) pixels[(y * 64 + x) * 4] = 255;
  state.sample.mockReset().mockReturnValueOnce(null).mockReturnValue({ width: 64, height: 36, pixels });
});
describe('hover range merging', () => {
  it('merges touching and neighboring row transitions', () => {
    const ranges: CursorHoverRange[] = [];
    addHoverRange(ranges, 1, 1.1);
    addHoverRange(ranges, 1.1, 1.2);
    addHoverRange(ranges, 1.3, 1.4);
    expect(ranges).toEqual([{ startSeconds: 1, endSeconds: 1.4 }]);
  });
  it('keeps distinct gestures and never shortens an existing range', () => {
    const ranges = [{ startSeconds: 1, endSeconds: 2 }];
    addHoverRange(ranges, 1.5, 1.7);
    addHoverRange(ranges, 3, 4);
    expect(ranges).toEqual([
      { startSeconds: 1, endSeconds: 2 },
      { startSeconds: 3, endSeconds: 4 },
    ]);
  });
  it('bounds pathological output without allocating further ranges', () => {
    const ranges = Array.from({ length: 250_000 }, (_, i) => ({ startSeconds: i * 2, endSeconds: i * 2 + 1 }));
    expect(() => addHoverRange(ranges, 500_000, 500_001)).toThrow(RangeError);
  });
});
describe('recorded-frame hover analysis', () => {
  it('detects on the original segment clock and bounds decode canvases', async () => {
    const progress = vi.fn();
    const sync = await analyzeCursorHovers(input(), new AbortController().signal, progress);
    expect(sync.ranges).toEqual([{ startSeconds: 5, endSeconds: 5 + 1 / 60 + 0.05 }]);
    expect(state.sinkOptions).toMatchObject({ size: { width: 384, height: 216 } });
    expect(state.gpuDispose).toHaveBeenCalledOnce();
    expect(state.dispose).toHaveBeenCalledOnce();
    expect(progress).toHaveBeenCalled();
  });
  it('resets comparisons across idle gaps between unique frames', async () => {
    state.frames = [frame(0), frame(0.016), frame(0.3), frame(0.316)];
    await analyzeCursorHovers(input(), new AbortController().signal);
    expect(state.sample).toHaveBeenCalledTimes(4);
    expect(state.reset).toHaveBeenCalledOnce();
  });
  it('does not open a decoder for empty, stationary or unrelated telemetry', async () => {
    const data = input();
    data.path = new Float64Array([0, 0.5, 0.5, 1, 1, 0.5, 0.5, 1]);
    expect(await analyzeCursorHovers(data, new AbortController().signal)).toEqual({ version: 1, ranges: [] });
    expect(state.getTrack).not.toHaveBeenCalled();
  });
  it.each(['missing', 'decode', 'unsupported', 'dimensions', 'gpu'])(
    'releases resources after %s failure',
    async (kind) => {
      if (kind === 'missing') state.frames = [null];
      if (kind === 'decode') state.failFrame = true;
      if (kind === 'unsupported') state.track.canDecode.mockResolvedValue(false);
      if (kind === 'dimensions') state.track.getDisplayWidth.mockResolvedValue(NaN);
      if (kind === 'gpu')
        state.sample.mockImplementation(() => {
          throw new Error('GPU lost');
        });
      await expect(analyzeCursorHovers(input(), new AbortController().signal)).rejects.toThrow();
      expect(state.dispose).toHaveBeenCalledOnce();
      if (!['unsupported', 'dimensions'].includes(kind)) expect(state.gpuDispose).toHaveBeenCalledOnce();
    },
  );
  it('fails explicitly when the screen track is absent', async () => {
    state.getTrack.mockResolvedValue(null);
    await expect(analyzeCursorHovers(input(), new AbortController().signal)).rejects.toThrow('cannot be decoded');
    expect(state.dispose).toHaveBeenCalledOnce();
  });
  it('cancels before opening and while decoding, with bounded cleanup', async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(analyzeCursorHovers(input(), cancelled.signal)).rejects.toThrow();
    expect(state.getTrack).not.toHaveBeenCalled();
    const controller = new AbortController();
    state.sample.mockImplementation(() => {
      controller.abort();
      return null;
    });
    await expect(analyzeCursorHovers(input(), controller.signal)).rejects.toThrow();
    expect(state.gpuDispose).toHaveBeenCalledOnce();
    expect(state.dispose).toHaveBeenCalled();
  });
  it('aborts and releases a stalled decoder after thirty seconds without progress', async () => {
    vi.useFakeTimers();
    let reject!: (error: Error) => void;
    state.getTrack.mockReturnValue(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    state.dispose.mockImplementation(() => reject(new Error('disposed')));
    const pending = analyzeCursorHovers(input(), new AbortController().signal);
    const failure = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(29_999);
    expect(state.dispose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await failure;
    expect(state.dispose).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
