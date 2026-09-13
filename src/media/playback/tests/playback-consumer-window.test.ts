import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasSink } from 'mediabunny';
import type { AssetDecoder, ClipConsumer } from '../playback-worker-consumers';

const runtime = vi.hoisted(() => ({
  CanvasSink: vi.fn(),
  sinkInstances: [] as Array<{ id: number }>,
}));

vi.mock('mediabunny', () => ({ CanvasSink: runtime.CanvasSink }));

import { PlaybackConsumerWindow } from '../playback-consumer-window';

const clip = (clipId: string, timelineStartSeconds: number, timelineDurationSeconds: number) => ({
  clipId,
  assetId: `${clipId}-asset`,
  timelineStartSeconds,
  timelineDurationSeconds,
  sourceInSeconds: 0,
  playbackRate: 1,
});

const makeConsumer = (clipId: string, timelineStartSeconds: number, timelineDurationSeconds: number): ClipConsumer => {
  const asset: AssetDecoder = {
    assetId: `${clipId}-asset`,
    opened: { dispose: vi.fn() } as never,
    sinkTrack: {} as never,
    displayWidth: 1_920,
    displayHeight: 1_080,
  };
  return {
    clip: clip(clipId, timelineStartSeconds, timelineDurationSeconds),
    asset,
    sink: { id: -1 } as unknown as CanvasSink,
    iterator: null,
    queue: [],
    iteratorGeneration: 0,
    lastTargetSeconds: null,
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

beforeEach(() => {
  runtime.CanvasSink.mockReset();
  runtime.sinkInstances.length = 0;
  runtime.CanvasSink.mockImplementation(function CanvasSinkMock() {
    const instance = { id: runtime.sinkInstances.length };
    runtime.sinkInstances.push(instance);
    return instance;
  });
});

afterEach(() => vi.restoreAllMocks());

describe('PlaybackConsumerWindow', () => {
  it('selects overlapping clips in input order across forward and backward queries', () => {
    const overlap = makeConsumer('overlap', 0.5, 1);
    const first = makeConsumer('first', 0, 1);
    const adjacent = makeConsumer('adjacent', 1, 1);
    const window = new PlaybackConsumerWindow();
    window.rebuild([overlap, first, adjacent]);

    expect(window.select(0.5)).toEqual([overlap, first]);
    expect(window.select(1)).toEqual([overlap, adjacent]);
    expect(window.select(1 - Number.EPSILON * 2)).toEqual([overlap, adjacent]);
    expect(window.select(0.25)).toEqual([first]);
    expect(window.select(2)).toEqual([]);
    expect(window.select(Number.NaN)).toEqual([]);
  });

  it('includes only clips inside the fixed 120ms preload window when requested', () => {
    const active = makeConsumer('active', 0, 0.1);
    const near = makeConsumer('near', 0.12, 1);
    const outside = makeConsumer('outside', 0.1201, 1);
    const window = new PlaybackConsumerWindow();
    window.rebuild([active, near, outside]);

    expect(window.select(0)).toEqual([active]);
    expect(window.select(0, true)).toEqual([active, near]);
    expect(window.select(0.12)).toEqual([near]);
    expect(window.select(0.12, true)).toEqual([near, outside]);
  });

  it('waits for reset before replacing an inactive sink and preserves active sinks', async () => {
    const inactive = makeConsumer('inactive', 0, 1);
    const active = makeConsumer('active', 1, 1);
    const originalInactiveSink = inactive.sink;
    const originalActiveSink = active.sink;
    const window = new PlaybackConsumerWindow();
    window.rebuild([inactive, active]);
    window.resident.add(inactive);
    const resetGate = deferred<void>();
    const reset = vi.fn(() => resetGate.promise);

    const preparing = window.prepare([active], reset, 'half');
    expect(reset).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledWith(inactive);
    expect(inactive.sink).toBe(originalInactiveSink);
    expect(window.resident.has(inactive)).toBe(true);
    expect(runtime.CanvasSink).not.toHaveBeenCalled();

    resetGate.resolve();
    await preparing;

    expect(inactive.sink).not.toBe(originalInactiveSink);
    expect(active.sink).toBe(originalActiveSink);
    expect(window.resident.has(inactive)).toBe(false);
    expect(window.resident.has(active)).toBe(true);
    expect(runtime.CanvasSink).toHaveBeenCalledWith(
      inactive.asset.sinkTrack,
      expect.objectContaining({ width: 960, height: 540, poolSize: 1 }),
    );
  });

  it('keeps a resident active sink unless a seek requests an active reset', async () => {
    const active = makeConsumer('active', 0, 2);
    const originalSink = active.sink;
    active.iterator = { next: vi.fn() } as unknown as ClipConsumer['iterator'];
    const window = new PlaybackConsumerWindow();
    window.rebuild([active]);
    window.resident.add(active);
    const reset = vi.fn().mockResolvedValue(undefined);

    await window.prepare([active], reset, 'full');
    expect(reset).not.toHaveBeenCalled();
    expect(active.sink).toBe(originalSink);

    await window.prepare([active], reset, 'full', true);
    expect(reset).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledWith(active);
    expect(active.sink).toBe(originalSink);
    expect(window.resident.has(active)).toBe(true);
    expect(runtime.CanvasSink).not.toHaveBeenCalled();
  });

  it('retains only still-present residents when rebuilding and clears its index on clear', () => {
    const retained = makeConsumer('retained', 0, 1);
    const removed = makeConsumer('removed', 1, 1);
    const added = makeConsumer('added', 2, 1);
    const window = new PlaybackConsumerWindow();
    window.rebuild([retained, removed]);
    window.resident.add(retained);
    window.resident.add(removed);

    window.rebuild([retained, added]);
    expect(window.resident).toEqual(new Set([retained]));
    expect(window.select(0.5)).toEqual([retained]);
    expect(window.select(1.5)).toEqual([]);
    expect(window.select(2.5)).toEqual([added]);

    window.clear();
    expect(window.resident.size).toBe(0);
    expect(window.select(0.5)).toEqual([]);
  });

  it('keeps an inactive resident and its old sink when reset fails', async () => {
    const inactive = makeConsumer('inactive', 0, 1);
    const originalSink = inactive.sink;
    const window = new PlaybackConsumerWindow();
    window.rebuild([inactive]);
    window.resident.add(inactive);
    const resetError = new Error('iterator cleanup failed');

    await expect(window.prepare([], vi.fn().mockRejectedValue(resetError), 'quarter')).rejects.toBe(resetError);

    expect(inactive.sink).toBe(originalSink);
    expect(window.resident.has(inactive)).toBe(true);
    expect(runtime.CanvasSink).not.toHaveBeenCalled();
  });

  it('does not replace or re-add consumers when clear supersedes a pending prepare', async () => {
    const inactive = makeConsumer('inactive', 0, 1);
    const active = makeConsumer('active', 1, 1);
    const originalSink = inactive.sink;
    const window = new PlaybackConsumerWindow();
    window.rebuild([inactive, active]);
    window.resident.add(inactive);
    const resetGate = deferred<void>();
    const reset = vi.fn(() => resetGate.promise);

    const preparing = window.prepare([active], reset, 'half');
    expect(reset).toHaveBeenCalledWith(inactive);
    window.clear();
    resetGate.resolve();
    await preparing;

    expect(inactive.sink).toBe(originalSink);
    expect(window.resident.size).toBe(0);
    expect(window.select(1.5)).toEqual([]);
    expect(runtime.CanvasSink).not.toHaveBeenCalled();
  });
});
