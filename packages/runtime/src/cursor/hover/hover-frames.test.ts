import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InputVideoTrack } from 'mediabunny';
import { uniqueHoverFrames } from './hover-frames';

const state = vi.hoisted(() => ({
  samples: [] as Array<{ timestamp: number; draw: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } | null>,
  options: vi.fn(),
  timestamps: vi.fn(),
  firstTimestamp: vi.fn(),
  failDecode: false,
}));
vi.mock('mediabunny', () => ({
  VideoSampleSink: class {
    constructor(track: unknown, options: unknown) {
      state.options(track, options);
    }
    async *samplesAtTimestamps(times: Iterable<number>, options: unknown) {
      state.timestamps([...times]);
      expect(options).toEqual({ skipLiveWait: true });
      for (const sample of state.samples) {
        if (state.failDecode) throw new Error('decoder lost');
        yield sample;
      }
    }
  },
}));
const track = { getFirstTimestamp: state.firstTimestamp } as unknown as InputVideoTrack;
const sample = (timestamp: number) => ({ timestamp, draw: vi.fn(), close: vi.fn() });
let canvases: Array<{ width: number; height: number }>;
let context: { imageSmoothingEnabled: boolean; imageSmoothingQuality: string } | null;
const frames = (check: () => void = vi.fn()) =>
  uniqueHoverFrames(track, [0, 0.016, 0.033], { width: 384, height: 232 }, undefined, check);
async function consume(check?: () => void) {
  const timestamps: number[] = [];
  for await (const frame of frames(check)) {
    expect(frame.canvas).toMatchObject({ width: 384, height: 232 });
    timestamps.push(frame.timestamp);
  }
  return timestamps;
}
beforeEach(() => {
  vi.clearAllMocks();
  state.samples = [sample(0), sample(0.016), sample(0.033)];
  state.failDecode = false;
  state.firstTimestamp.mockResolvedValue(0);
  canvases = [];
  context = { imageSmoothingEnabled: false, imageSmoothingQuality: 'low' };
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        canvases.push(this);
      }
      getContext(kind: string, options: unknown) {
        expect(kind).toBe('2d');
        expect(options).toEqual({ alpha: false, willReadFrequently: true });
        return context;
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('bounded unique hover frames', () => {
  it('draws each distinct frame directly into one retained analysis canvas', async () => {
    expect(await consume()).toEqual([0, 0.016, 0.033]);
    expect(canvases).toEqual([{ width: 0, height: 0 }]);
    expect(context).toMatchObject({ imageSmoothingEnabled: true, imageSmoothingQuality: 'high' });
    expect(state.timestamps).toHaveBeenCalledExactlyOnceWith([0, 0.016, 0.033]);
    for (const frame of state.samples) {
      expect(frame!.draw).toHaveBeenCalledExactlyOnceWith(context, 0, 0, 384, 232);
      expect(frame!.close).toHaveBeenCalledOnce();
    }
  });
  it('skips VFR duplicates and regressions before drawing and closes every borrowed sample', async () => {
    state.samples = [sample(0), sample(0), sample(-0.01), sample(0.016), sample(0.016), sample(0.033)];
    const check = vi.fn();
    expect(await consume(check)).toEqual([0, 0.016, 0.033]);
    expect(check).toHaveBeenCalledTimes(7);
    for (const index of [1, 2, 4]) expect(state.samples[index]!.draw).not.toHaveBeenCalled();
    for (const frame of state.samples) expect(frame!.close).toHaveBeenCalledOnce();
  });
  it('preserves decoder selection and does not keep samples after advancing', async () => {
    const options = { hardwareAcceleration: 'prefer-software' as const };
    const iterator = uniqueHoverFrames(track, [0, 0.016, 0.033], { width: 384, height: 232 }, options, () => {});
    await iterator.next();
    expect(state.samples[0]!.close).not.toHaveBeenCalled();
    await iterator.next();
    expect(state.samples[0]!.close).toHaveBeenCalledOnce();
    await iterator.return();
    expect(state.samples[1]!.close).toHaveBeenCalledOnce();
    expect(state.samples[2]!.close).not.toHaveBeenCalled();
    expect(state.options).toHaveBeenCalledExactlyOnceWith(track, options);
    expect(canvases[0]).toEqual({ width: 0, height: 0 });
  });
  it.each([
    { first: 0.01, requested: [0.016, 0.033], decoded: [0.01, 0.033] },
    { first: 0.016, requested: [0.016, 0.033], decoded: [0.016, 0.033] },
    { first: 0.016000001, requested: [0.033], decoded: [0.016000001] },
    { first: -0.25, requested: [0, 0.016, 0.033], decoded: [0, 0.016, 0.033] },
  ])(
    'queries recorded images from $first seconds without shifting their clock',
    async ({ first, requested, decoded }) => {
      state.firstTimestamp.mockResolvedValue(first);
      state.samples = decoded.map(sample);
      expect(await consume()).toEqual(decoded);
      expect(state.timestamps).toHaveBeenCalledExactlyOnceWith(requested);
      for (const frame of state.samples) expect(frame!.close).toHaveBeenCalledOnce();
    },
  );
  it('returns no comparisons when movement only precedes the first recorded image', async () => {
    state.firstTimestamp.mockResolvedValue(0.125);
    state.samples = [];
    const check = vi.fn();
    expect(await consume(check)).toEqual([]);
    expect(state.timestamps).toHaveBeenCalledExactlyOnceWith([]);
    expect(check).toHaveBeenCalledTimes(4);
    expect(canvases[0]).toEqual({ width: 0, height: 0 });
  });
  it('still rejects an unavailable image at a timestamp inside the recorded range', async () => {
    state.firstTimestamp.mockResolvedValue(0.01);
    state.samples = [sample(0.01), null];
    await expect(consume()).rejects.toThrow('A recorded screen frame is missing');
    expect(state.timestamps).toHaveBeenCalledExactlyOnceWith([0.016, 0.033]);
    expect(state.samples[0]!.close).toHaveBeenCalledOnce();
    expect(canvases[0]).toEqual({ width: 0, height: 0 });
  });
  it.each([NaN, Infinity, -Infinity])(
    'rejects a non-finite first timestamp %s before creating a decoder',
    async (value) => {
      state.firstTimestamp.mockResolvedValue(value);
      await expect(consume()).rejects.toThrow('Invalid recorded screen start timestamp.');
      expect(state.options).not.toHaveBeenCalled();
      expect(canvases[0]).toEqual({ width: 0, height: 0 });
    },
  );
  it('releases its canvas when reading the first timestamp fails', async () => {
    state.firstTimestamp.mockRejectedValueOnce(new Error('metadata unavailable'));
    await expect(consume()).rejects.toThrow('metadata unavailable');
    expect(state.options).not.toHaveBeenCalled();
    expect(canvases[0]).toEqual({ width: 0, height: 0 });
  });
  it('checks cancellation during pre-roll without drawing a replacement image', async () => {
    state.firstTimestamp.mockResolvedValue(1);
    const check = vi
      .fn()
      .mockImplementationOnce(() => {})
      .mockImplementation(() => {
        throw new Error('cancelled');
      });
    await expect(consume(check)).rejects.toThrow('cancelled');
    for (const frame of state.samples) expect(frame!.draw).not.toHaveBeenCalled();
    expect(canvases[0]).toEqual({ width: 0, height: 0 });
  });
  it('releases the current sample and canvas when the consumer stops early', async () => {
    for await (const _frame of frames()) break;
    expect(state.samples[0]!.close).toHaveBeenCalledOnce();
    expect(state.samples[1]!.draw).not.toHaveBeenCalled();
    expect(canvases[0]).toEqual({ width: 0, height: 0 });
  });
  it('releases borrowed resources when cancellation occurs before drawing', async () => {
    const check = vi
      .fn()
      .mockImplementationOnce(() => {})
      .mockImplementation(() => {
        throw new Error('cancelled');
      });
    await expect(consume(check)).rejects.toThrow('cancelled');
    expect(state.samples[0]!.draw).not.toHaveBeenCalled();
    expect(state.samples[0]!.close).toHaveBeenCalledOnce();
    expect(canvases[0]).toEqual({ width: 0, height: 0 });
  });
  it('cancels after reading metadata without acquiring a frame or decoder', async () => {
    await expect(
      consume(() => {
        throw new Error('cancelled');
      }),
    ).rejects.toThrow('cancelled');
    expect(state.options).not.toHaveBeenCalled();
    for (const frame of state.samples) expect(frame!.close).not.toHaveBeenCalled();
    expect(canvases[0]).toEqual({ width: 0, height: 0 });
  });
  it('releases the source frame even when downsampling fails', async () => {
    state.samples[0]!.draw.mockImplementation(() => {
      throw new Error('draw failed');
    });
    await expect(consume()).rejects.toThrow('draw failed');
    expect(state.samples[0]!.close).toHaveBeenCalledOnce();
    expect(canvases[0]).toEqual({ width: 0, height: 0 });
  });
  it.each(['missing', 'decode', 'context', 'empty'])('cleans its analysis surface on %s input', async (kind) => {
    if (kind === 'missing') state.samples = [null];
    if (kind === 'decode') state.failDecode = true;
    if (kind === 'context') context = null;
    if (kind === 'empty') state.samples = [];
    if (kind === 'empty') expect(await consume()).toEqual([]);
    else await expect(consume()).rejects.toThrow();
    expect(canvases[0]).toEqual({ width: 0, height: 0 });
    if (kind === 'context') expect(state.options).not.toHaveBeenCalled();
  });
});
