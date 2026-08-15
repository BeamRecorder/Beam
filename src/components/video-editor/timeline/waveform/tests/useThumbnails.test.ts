import { defineComponent, nextTick, ref, type Ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useThumbnails } from '../useThumbnails';
import type { MediaAsset } from '~/media/shared/composition-types';

const workerState = vi.hoisted(() => {
  const instances: Array<{
    onmessage?: (event: MessageEvent) => void;
    onerror?: () => void;
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
  }> = [];
  class FakeWorker {
    onmessage?: (event: MessageEvent) => void;
    onerror?: () => void;
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor() {
      instances.push(this);
    }
  }
  return { FakeWorker, instances };
});

vi.mock('~/media/playback/thumbnail.worker?worker', () => ({
  default: workerState.FakeWorker,
}));

const workerAt = (index: number) => {
  const worker = workerState.instances[index];
  if (!worker) throw new Error(`Expected thumbnail worker ${index}.`);
  return worker;
};

const sendWorkerMessage = (index: number, data: unknown) => {
  workerAt(index).onmessage?.({ data } as MessageEvent);
};

const latestRequestGeneration = (index = 0) => {
  const message = [...workerAt(index).postMessage.mock.calls]
    .map(([value]) => value as { type?: string; generation?: number })
    .reverse()
    .find((value) => value.type === 'request-frames');
  if (!message || typeof message.generation !== 'number') throw new Error('Expected a thumbnail request.');
  return message.generation;
};

let animationFrames: Map<number, FrameRequestCallback>;
let nextAnimationFrameId: number;

const flushAnimationFrame = () => {
  const frames = [...animationFrames.entries()];
  animationFrames.clear();
  for (const [, callback] of frames) callback(0);
};

describe('useThumbnails', () => {
  let source: Ref<MediaAsset | null>;
  let api: ReturnType<typeof useThumbnails>;
  let wrapper: ReturnType<typeof mount>;
  const createObjectURL = vi.fn((_blob: Blob | MediaSource): string => 'blob:initial');
  const revokeObjectURL = vi.fn((_url: string): void => undefined);

  const asset = (overrides: Partial<MediaAsset> = {}): MediaAsset => ({
    id: 'video-1',
    kind: 'video',
    name: 'Recording',
    fileName: 'video.mp4',
    durationMs: 240_000,
    width: 1920,
    height: 1080,
    src: 'project-media://asset/video-1',
    origin: 'project',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    workerState.instances.length = 0;
    animationFrames = new Map();
    nextAnimationFrameId = 0;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const id = ++nextAnimationFrameId;
        animationFrames.set(id, callback);
        return id;
      }),
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => {
        animationFrames.delete(id);
      }),
    );
    source = ref<MediaAsset | null>(null);
    createObjectURL.mockImplementation(() => `blob:${createObjectURL.mock.calls.length}`);
    revokeObjectURL.mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL);
    const Harness = defineComponent({
      setup() {
        api = useThumbnails(source);
        return () => null;
      },
    });
    wrapper = mount(Harness);
  });

  afterEach(() => {
    wrapper.unmount();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const ready = (generation: number, time: number, blob = new Blob([String(time)]), workerIndex = 0) => {
    sendWorkerMessage(workerIndex, { type: 'frame-ready', generation, time, blob });
  };

  const batchStarted = (generation: number, workerIndex: number) => {
    sendWorkerMessage(workerIndex, { type: 'batch-started', generation });
  };

  const batchFinished = (generation: number, workerIndex: number) => {
    sendWorkerMessage(workerIndex, { type: 'batch-finished', generation });
  };

  it('queues visible frames, extracts missing thumbnails, and retains visible entries in the bounded cache', async () => {
    source.value = asset();
    await nextTick();
    api.requestVisibleFrames([1, 2, 1]);
    await flushPromises();

    const firstWorker = workerAt(0);
    const secondWorker = workerAt(1);
    const batchGeneration = latestRequestGeneration(0);
    expect(workerState.instances).toHaveLength(2);
    expect(firstWorker.postMessage).toHaveBeenCalledWith({
      type: 'request-frames',
      generation: batchGeneration,
      source: {
        assetId: 'video-1',
        kind: 'video',
        label: 'Recording',
        url: 'project-media://asset/video-1',
      },
      visibleTimes: [1],
    });
    expect(secondWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ generation: batchGeneration, visibleTimes: [2] }),
    );

    batchStarted(batchGeneration, 0);
    batchStarted(batchGeneration, 1);
    expect(api.isExtracting.value).toBe(true);
    ready(batchGeneration, 1);
    ready(batchGeneration, 2, new Blob(['2']), 1);
    flushAnimationFrame();
    expect(api.thumbnails[1]).toContain('blob:');
    ready(batchGeneration, 1, new Blob(['replacement']));
    flushAnimationFrame();
    expect(revokeObjectURL).toHaveBeenCalled();
    batchFinished(batchGeneration, 0);
    expect(api.isExtracting.value).toBe(true);
    batchFinished(batchGeneration, 1);
    expect(api.isExtracting.value).toBe(false);

    api.requestVisibleFrames([1]);
    await flushPromises();
    expect(firstWorker.postMessage.mock.calls.filter(([message]) => message.type === 'request-frames')).toHaveLength(1);

    for (let time = 2; time <= 181; time += 1) ready(batchGeneration, time);
    flushAnimationFrame();
    expect(api.thumbnails[1]).toBeDefined();
    expect(Object.keys(api.thumbnails)).toHaveLength(96);

    sendWorkerMessage(0, { type: 'error', generation: batchGeneration, message: 'failed' });
    expect(api.isExtracting.value).toBe(false);
    expect(api.error.value).toBe('failed');
    firstWorker.onerror?.();
    expect(api.isExtracting.value).toBe(false);
    expect(api.error.value).toBe('Timeline thumbnail decoding failed.');
  });

  it('keeps the currently visible thumbnail when the bounded cache receives more frames', async () => {
    source.value = asset();
    await nextTick();
    api.requestVisibleFrames([1]);
    await flushPromises();
    const requestGeneration = latestRequestGeneration();
    ready(requestGeneration, 1);
    flushAnimationFrame();

    for (let time = 2; time <= 181; time += 1) ready(requestGeneration, time);
    flushAnimationFrame();

    expect(api.thumbnails[1]).toBeDefined();
    expect(Object.keys(api.thumbnails)).toHaveLength(96);
  });

  it('ignores stale generations and clears pending work when the asset changes', async () => {
    source.value = asset();
    await nextTick();
    api.requestVisibleFrames([4]);
    await flushPromises();
    const worker = workerState.instances[0]!;
    const firstGeneration = latestRequestGeneration();
    ready(firstGeneration - 1, 4);
    expect(api.thumbnails[4]).toBeUndefined();

    api.clearCache();
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'clear',
      generation: expect.any(Number),
    });
    source.value = null;
    await nextTick();
    api.requestVisibleFrames([5]);
    await flushPromises();
    expect(api.isExtracting.value).toBe(false);

    source.value = asset({ id: 'video-2', src: 'project-media://asset/video-2' });
    await nextTick();
    api.requestVisibleFrames([6]);
    await flushPromises();
    const secondGeneration = latestRequestGeneration();
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      type: 'request-frames',
      generation: secondGeneration,
      source: {
        assetId: 'video-2',
        kind: 'video',
        label: 'Recording',
        url: 'project-media://asset/video-2',
      },
      visibleTimes: [6],
    });
  });

  it('coalesces multiple scroll requests in one microtask to the latest viewport', async () => {
    source.value = asset();
    await nextTick();
    api.requestVisibleFrames([1]);
    api.requestVisibleFrames([4, 5]);
    await flushPromises();

    const firstWorker = workerAt(0);
    const secondWorker = workerAt(1);
    const firstRequests = firstWorker.postMessage.mock.calls.filter(([message]) => message.type === 'request-frames');
    const secondRequests = secondWorker.postMessage.mock.calls.filter(([message]) => message.type === 'request-frames');
    expect(firstRequests).toHaveLength(1);
    expect(secondRequests).toHaveLength(1);
    const firstGeneration = (firstRequests[0]?.[0] as { generation: number }).generation;
    expect(secondRequests[0]?.[0]).toEqual(expect.objectContaining({ generation: firstGeneration, visibleTimes: [5] }));
    expect(firstGeneration).toEqual(expect.any(Number));
  });

  it('uses a fresh generation for each viewport batch and source change', async () => {
    source.value = asset();
    await nextTick();
    api.requestVisibleFrames([1]);
    await flushPromises();
    api.requestVisibleFrames([2]);
    await flushPromises();

    const worker = workerState.instances[0]!;
    const requestGenerations = worker.postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message.type === 'request-frames')
      .map((message) => message.generation);
    expect(requestGenerations).toHaveLength(2);
    expect(requestGenerations[1]).toBeGreaterThan(requestGenerations[0]!);

    source.value = asset({ id: 'video-2', src: 'project-media://asset/video-2' });
    await nextTick();
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'clear', generation: expect.any(Number) });
  });

  it('exposes synchronous descriptor failures without posting invalid requests', async () => {
    source.value = asset({ src: 'file:///recording.mp4' });
    await nextTick();
    api.requestVisibleFrames([2]);
    await flushPromises();

    expect(api.isExtracting.value).toBe(false);
    expect(api.error.value).toBe('Timeline thumbnail decoding failed.');
    expect(workerState.instances[0]?.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'request-frames' }),
    );
  });

  it('clears the error when a new request starts and when the cache is cleared', async () => {
    source.value = asset();
    await nextTick();
    api.requestVisibleFrames([3]);
    await flushPromises();
    sendWorkerMessage(0, { type: 'error', generation: latestRequestGeneration(), message: 'decoder failed' });
    expect(api.error.value).toBe('decoder failed');

    api.requestVisibleFrames([4]);
    await flushPromises();
    expect(api.error.value).toBeNull();

    api.clearCache();
    expect(api.error.value).toBeNull();
    expect(api.isExtracting.value).toBe(false);
  });

  it('ignores stale pool responses, reports worker errors, and terminates both workers', async () => {
    source.value = asset();
    await nextTick();
    api.requestVisibleFrames([10, 20, 30, 40]);
    await flushPromises();

    const batchGeneration = latestRequestGeneration(0);
    expect(workerState.instances).toHaveLength(2);
    batchStarted(batchGeneration, 0);
    batchStarted(batchGeneration, 1);
    expect(api.isExtracting.value).toBe(true);
    ready(batchGeneration - 1, 10, new Blob(['stale']), 0);
    ready(batchGeneration - 1, 40, new Blob(['stale']), 1);
    expect(api.thumbnails[10]).toBeUndefined();
    expect(api.thumbnails[40]).toBeUndefined();

    sendWorkerMessage(1, { type: 'error', generation: batchGeneration, message: 'second worker failed' });
    expect(api.isExtracting.value).toBe(true);
    expect(api.error.value).toBe('second worker failed');
    batchFinished(batchGeneration, 0);
    expect(api.isExtracting.value).toBe(false);

    api.clearCache();
    const clearGeneration = [...workerAt(0).postMessage.mock.calls]
      .map(([message]) => message as { type?: string; generation?: number })
      .reverse()
      .find((message) => message.type === 'clear')?.generation;
    expect(clearGeneration).toEqual(expect.any(Number));
    expect(workerAt(1).postMessage).toHaveBeenLastCalledWith({ type: 'clear', generation: clearGeneration });
    ready(batchGeneration, 20, new Blob(['stale-after-clear']), 0);
    expect(api.thumbnails[20]).toBeUndefined();

    wrapper.unmount();
    expect(workerAt(0).terminate).toHaveBeenCalledOnce();
    expect(workerAt(1).terminate).toHaveBeenCalledOnce();
  });

  it('returns early for empty sources and clears cached object URLs on source changes and unmount', async () => {
    api.requestVisibleFrames([1]);
    await flushPromises();
    expect(workerState.instances).toHaveLength(0);

    source.value = asset();
    await nextTick();
    api.requestVisibleFrames([1]);
    await flushPromises();
    ready(latestRequestGeneration(), 1);
    flushAnimationFrame();
    expect(api.thumbnails[1]).toBeDefined();
    source.value = null;
    await nextTick();
    expect(api.thumbnails[1]).toBeUndefined();
    expect(revokeObjectURL).toHaveBeenCalled();
  });

  it('keeps the worker and cache when the asset object changes without changing its identity', async () => {
    source.value = asset();
    await nextTick();
    api.requestVisibleFrames([1]);
    await flushPromises();
    const worker = workerState.instances[0]!;
    ready(latestRequestGeneration(), 1);
    flushAnimationFrame();
    const postCount = worker.postMessage.mock.calls.length;
    const revokeCount = revokeObjectURL.mock.calls.length;

    source.value = asset();
    await nextTick();

    expect(api.thumbnails[1]).toBeDefined();
    expect(worker.postMessage).toHaveBeenCalledTimes(postCount);
    expect(revokeObjectURL).toHaveBeenCalledTimes(revokeCount);

    source.value = asset({ id: 'video-2', src: 'project-media://asset/video-2' });
    await nextTick();
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'clear', generation: expect.any(Number) });
    expect(revokeObjectURL.mock.calls.length).toBeGreaterThan(revokeCount);
    expect(api.thumbnails[1]).toBeUndefined();
  });

  it('keeps the LRU cache and workers across A-to-B-to-A scrolling while invalidating only the stale batch', async () => {
    source.value = asset();
    await nextTick();
    api.requestVisibleFrames([1, 2]);
    await flushPromises();

    const firstWorkers = [...workerState.instances];
    const firstGeneration = latestRequestGeneration(0);
    batchStarted(firstGeneration, 0);
    batchStarted(firstGeneration, 1);
    ready(firstGeneration, 1, new Blob(['a-1']), 0);
    ready(firstGeneration, 2, new Blob(['a-2']), 1);
    flushAnimationFrame();
    batchFinished(firstGeneration, 0);
    batchFinished(firstGeneration, 1);
    expect(api.isExtracting.value).toBe(false);
    expect(api.thumbnails[1]).toBeDefined();
    expect(api.thumbnails[2]).toBeDefined();

    const clearCountBeforeScroll = workerState.instances.reduce(
      (count, worker) => count + worker.postMessage.mock.calls.filter(([message]) => message.type === 'clear').length,
      0,
    );
    const requestCountBeforeScroll = workerState.instances.reduce(
      (count, worker) =>
        count + worker.postMessage.mock.calls.filter(([message]) => message.type === 'request-frames').length,
      0,
    );

    api.requestVisibleFrames([2, 3]);
    await flushPromises();

    const secondGeneration = latestRequestGeneration(0);
    expect(secondGeneration).toBeGreaterThan(firstGeneration);
    expect(workerAt(0).postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'request-frames', generation: secondGeneration, visibleTimes: [3] }),
    );
    expect(
      workerState.instances.reduce(
        (count, worker) =>
          count + worker.postMessage.mock.calls.filter(([message]) => message.type === 'request-frames').length,
        0,
      ),
    ).toBe(requestCountBeforeScroll + 1);
    expect(
      workerState.instances.reduce(
        (count, worker) => count + worker.postMessage.mock.calls.filter(([message]) => message.type === 'clear').length,
        0,
      ),
    ).toBe(clearCountBeforeScroll);
    expect(workerState.instances).toEqual(firstWorkers);

    ready(firstGeneration, 99, new Blob(['stale-old-batch']), 0);
    expect(api.thumbnails[99]).toBeUndefined();
    batchStarted(secondGeneration, 0);
    ready(secondGeneration, 3, new Blob(['b-3']), 0);
    flushAnimationFrame();
    batchFinished(secondGeneration, 0);
    expect(api.thumbnails[3]).toBeDefined();

    api.requestVisibleFrames([1, 2]);
    await flushPromises();

    expect(api.thumbnails[1]).toBeDefined();
    expect(api.thumbnails[2]).toBeDefined();
    expect(
      workerState.instances.reduce(
        (count, worker) =>
          count + worker.postMessage.mock.calls.filter(([message]) => message.type === 'request-frames').length,
        0,
      ),
    ).toBe(requestCountBeforeScroll + 1);
    expect(
      workerState.instances.every((worker) =>
        worker.postMessage.mock.calls.every(([message]) => message.type !== 'dispose'),
      ),
    ).toBe(true);
  });
});
