import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InputVideoTrack } from 'mediabunny';
import { uniqueHoverFrames } from './hover-frames';

const state = vi.hoisted(() => ({
  samples: [] as Array<{ timestamp: number; draw: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } | null>,
  options: vi.fn(),
  failDecode: false,
}));
vi.mock('mediabunny', () => ({
  VideoSampleSink: class {
    constructor(track: unknown, options: unknown) {
      state.options(track, options);
    }
    async *samplesAtTimestamps(times: Iterable<number>, options: unknown) {
      expect([...times]).toEqual([0, 0.016, 0.033]);
      expect(options).toEqual({ skipLiveWait: true });
      for (const sample of state.samples) {
        if (state.failDecode) throw new Error('decoder lost');
        yield sample;
      }
    }
  },
}));
const track = {} as InputVideoTrack;
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
    for (const frame of state.samples) {
      expect(frame!.draw).toHaveBeenCalledExactlyOnceWith(context, 0, 0, 384, 232);
      expect(frame!.close).toHaveBeenCalledOnce();
    }
  });
  it('skips VFR duplicates and regressions before drawing and closes every borrowed sample', async () => {
    state.samples = [sample(0), sample(0), sample(-0.01), sample(0.016), sample(0.016), sample(0.033)];
    const check = vi.fn();
    expect(await consume(check)).toEqual([0, 0.016, 0.033]);
    expect(check).toHaveBeenCalledTimes(6);
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
  it('releases the current sample and canvas when the consumer stops early', async () => {
    for await (const _frame of frames()) break;
    expect(state.samples[0]!.close).toHaveBeenCalledOnce();
    expect(state.samples[1]!.draw).not.toHaveBeenCalled();
    expect(canvases[0]).toEqual({ width: 0, height: 0 });
  });
  it('releases borrowed resources when cancellation occurs before drawing', async () => {
    await expect(
      consume(() => {
        throw new Error('cancelled');
      }),
    ).rejects.toThrow('cancelled');
    expect(state.samples[0]!.draw).not.toHaveBeenCalled();
    expect(state.samples[0]!.close).toHaveBeenCalledOnce();
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
