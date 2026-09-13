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

  let additionalUnmounts: Array<() => void> = [];
  const mountAdditionalClient = (initialAsset: MediaAsset | null = asset()) => {
    const clientSource = ref<MediaAsset | null>(initialAsset);
    let clientApi!: ReturnType<typeof useThumbnails>;
    const Harness = defineComponent({
      setup() {
        clientApi = useThumbnails(clientSource);
        return () => null;
      },
    });
    const clientWrapper = mount(Harness);
    let active = true;
    const unmount = () => {
      if (!active) return;
      active = false;
      clientWrapper.unmount();
    };
    additionalUnmounts.push(unmount);
    return { source: clientSource, api: clientApi, unmount };
  };

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
    additionalUnmounts = [];
  });

  afterEach(() => {
    for (const unmount of additionalUnmounts) unmount();
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

  const requestMessages = () =>
    workerState.instances
      .flatMap((worker) =>
        worker.postMessage.mock.calls.map(
          ([message]) =>
            message as {
              type?: string;
              generation?: number;
              visibleTimes?: number[];
              source?: { assetId: string; url: string };
            },
        ),
      )
      .filter((message) => message.type === 'request-frames');

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
    expect(api.thumbnails.value[1]).toContain('blob:');
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
    expect(api.thumbnails.value[1]).toBeDefined();
    expect(Object.keys(api.thumbnails.value)).toHaveLength(96);

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

    expect(api.thumbnails.value[1]).toBeDefined();
    expect(Object.keys(api.thumbnails.value)).toHaveLength(96);
  });

  it('ignores stale generations and clears pending work when the asset changes', async () => {
    source.value = asset();
    await nextTick();
    api.requestVisibleFrames([4]);
    await flushPromises();
    const worker = workerState.instances[0]!;
    const firstWorkers = [...workerState.instances];
    const firstGeneration = latestRequestGeneration();
    ready(firstGeneration - 1, 4);
    expect(api.thumbnails.value[4]).toBeUndefined();

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

    source.value = asset({ src: 'project-media://asset/video-1-version-2' });
    await nextTick();
    api.requestVisibleFrames([6]);
    await flushPromises();
    const secondGeneration = latestRequestGeneration(2);
    expect(firstWorkers).toHaveLength(2);
    expect(firstWorkers.every((item) => item.terminate.mock.calls.length === 1)).toBe(true);
    expect(workerState.instances).toHaveLength(4);
    expect(workerAt(2).postMessage).toHaveBeenLastCalledWith({
      type: 'request-frames',
      generation: secondGeneration,
      source: {
        assetId: 'video-1',
        kind: 'video',
        label: 'Recording',
        url: 'project-media://asset/video-1-version-2',
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
    const firstGeneration = (firstRequests[0]![0] as { generation: number }).generation;
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

    const worker = workerAt(0);
    const firstWorkers = [...workerState.instances];
    const requestGenerations = worker.postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message.type === 'request-frames')
      .map((message) => message.generation);
    expect(requestGenerations).toHaveLength(2);
    expect(requestGenerations[1]).toBeGreaterThan(requestGenerations[0]!);

    source.value = asset({ src: 'project-media://asset/video-1-version-2' });
    await nextTick();
    expect(firstWorkers.every((worker) => worker.terminate.mock.calls.length === 1)).toBe(true);
    api.requestVisibleFrames([3]);
    await flushPromises();
    expect(workerState.instances).toHaveLength(4);
    expect(workerAt(2).postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'request-frames',
        source: expect.objectContaining({ assetId: 'video-1', url: 'project-media://asset/video-1-version-2' }),
        visibleTimes: [3],
      }),
    );
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
    expect(api.thumbnails.value[10]).toBeUndefined();
    expect(api.thumbnails.value[40]).toBeUndefined();

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
    expect(api.thumbnails.value[20]).toBeUndefined();

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
    expect(api.thumbnails.value[1]).toBeDefined();
    source.value = null;
    await nextTick();
    expect(api.thumbnails.value[1]).toBeUndefined();
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

    expect(api.thumbnails.value[1]).toBeDefined();
    expect(worker.postMessage).toHaveBeenCalledTimes(postCount);
    expect(revokeObjectURL).toHaveBeenCalledTimes(revokeCount);

    source.value = asset({ src: 'project-media://asset/video-1-version-2' });
    await nextTick();
    expect(workerState.instances).toHaveLength(2);
    expect(workerState.instances.every((item) => item.terminate.mock.calls.length === 1)).toBe(true);
    expect(revokeObjectURL.mock.calls.length).toBeGreaterThan(revokeCount);
    expect(api.thumbnails.value[1]).toBeUndefined();
    api.requestVisibleFrames([1]);
    await flushPromises();
    expect(workerState.instances).toHaveLength(4);
    expect(workerAt(2).postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'request-frames',
        source: expect.objectContaining({ assetId: 'video-1', url: 'project-media://asset/video-1-version-2' }),
      }),
    );
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
    expect(api.thumbnails.value[1]).toBeDefined();
    expect(api.thumbnails.value[2]).toBeDefined();

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
    expect(api.thumbnails.value[99]).toBeUndefined();
    batchStarted(secondGeneration, 0);
    ready(secondGeneration, 3, new Blob(['b-3']), 0);
    flushAnimationFrame();
    batchFinished(secondGeneration, 0);
    expect(api.thumbnails.value[3]).toBeDefined();

    api.requestVisibleFrames([1, 2]);
    await flushPromises();

    expect(api.thumbnails.value[1]).toBeDefined();
    expect(api.thumbnails.value[2]).toBeDefined();
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

  it('shares workers and the frame cache across consumers while unioning their visible requests', async () => {
    source.value = asset();
    await nextTick();
    const peerA = mountAdditionalClient(asset());
    const peerB = mountAdditionalClient(asset());
    await nextTick();

    api.requestVisibleFrames([1, 2, 2]);
    peerA.api.requestVisibleFrames([2, 3]);
    peerB.api.requestVisibleFrames([3, 4, 4]);
    await flushPromises();

    expect(workerState.instances).toHaveLength(2);
    const firstBatch = requestMessages();
    const firstGeneration = firstBatch[0]?.generation;
    expect(firstBatch).toHaveLength(2);
    expect(firstBatch.every((message) => message.generation === firstGeneration)).toBe(true);
    expect(firstBatch.flatMap((message) => message.visibleTimes ?? []).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);

    ready(firstGeneration!, 2, new Blob(['shared-frame']));
    flushAnimationFrame();
    const sharedUrl = api.thumbnails.value[2];
    expect(sharedUrl).toBeTruthy();
    expect(peerA.api.thumbnails.value[2]).toBe(sharedUrl);
    expect(peerB.api.thumbnails.value[2]).toBe(sharedUrl);
    expect(createObjectURL).toHaveBeenCalledOnce();

    peerA.unmount();
    expect(workerState.instances.every((worker) => worker.terminate.mock.calls.length === 0)).toBe(true);
    api.requestVisibleFrames([5]);
    peerB.api.requestVisibleFrames([5, 6]);
    await flushPromises();

    const secondBatch = requestMessages().filter((message) => message.generation !== firstGeneration);
    const secondGeneration = secondBatch[0]?.generation;
    expect(secondGeneration).toBeGreaterThan(firstGeneration!);
    expect(secondBatch.flatMap((message) => message.visibleTimes ?? []).sort((a, b) => a - b)).toEqual([5, 6]);
    ready(secondGeneration!, 5, new Blob(['still-shared']));
    flushAnimationFrame();
    expect(api.thumbnails.value[5]).toBe(peerB.api.thumbnails.value[5]);
    expect(workerState.instances).toHaveLength(2);
    expect(workerState.instances.every((worker) => worker.terminate.mock.calls.length === 0)).toBe(true);

    peerB.unmount();
    api.requestVisibleFrames([7]);
    await flushPromises();
    const thirdGeneration = latestRequestGeneration(0);
    expect(thirdGeneration).toBeGreaterThan(secondGeneration!);
    ready(thirdGeneration, 7, new Blob(['last-subscriber']));
    flushAnimationFrame();
    const cachedUrls = Object.values(api.thumbnails.value);
    expect(cachedUrls).toHaveLength(3);

    wrapper.unmount();
    expect(workerState.instances.map((worker) => worker.terminate.mock.calls.length)).toEqual([1, 1]);
    expect(revokeObjectURL).toHaveBeenCalledTimes(cachedUrls.length);
    for (const url of cachedUrls) expect(revokeObjectURL).toHaveBeenCalledWith(url);
  });

  it('does not restart a shared batch for an unchanged union or a frame waiting for animation-frame caching', async () => {
    source.value = asset();
    await nextTick();
    const peer = mountAdditionalClient(asset());
    await nextTick();

    api.requestVisibleFrames([1, 2]);
    await flushPromises();
    const generation = latestRequestGeneration(0);
    const requestCount = requestMessages().length;
    ready(generation, 1, new Blob(['pending-cache-frame']));

    peer.api.requestVisibleFrames([1, 2]);
    await flushPromises();
    expect(latestRequestGeneration(0)).toBe(generation);
    expect(requestMessages()).toHaveLength(requestCount);

    flushAnimationFrame();
    expect(api.thumbnails.value[1]).toBeTruthy();
    expect(peer.api.thumbnails.value[1]).toBe(api.thumbnails.value[1]);
    expect(workerState.instances).toHaveLength(2);
  });

  it('stops workers for an empty viewport but retains cached URLs and restarts only for missing frames', async () => {
    source.value = asset();
    await nextTick();
    api.requestVisibleFrames([1]);
    await flushPromises();
    const generation = latestRequestGeneration(0);
    const firstPair = [...workerState.instances];
    ready(generation, 1, new Blob(['visible-before-empty']));
    flushAnimationFrame();
    const cachedUrl = api.thumbnails.value[1];
    expect(cachedUrl).toBeTruthy();

    api.requestVisibleFrames([]);
    await flushPromises();
    expect(firstPair.map((worker) => worker.terminate.mock.calls.length)).toEqual([1, 1]);
    expect(api.thumbnails.value[1]).toBe(cachedUrl);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    const requestCount = requestMessages().length;
    api.requestVisibleFrames([1]);
    await flushPromises();
    expect(api.thumbnails.value[1]).toBe(cachedUrl);
    expect(workerState.instances).toHaveLength(2);
    expect(requestMessages()).toHaveLength(requestCount);

    api.requestVisibleFrames([2]);
    await flushPromises();
    expect(workerState.instances).toHaveLength(4);
    expect(firstPair.map((worker) => worker.terminate.mock.calls.length)).toEqual([1, 1]);
    expect(workerAt(2).terminate).not.toHaveBeenCalled();
    expect(workerAt(3).terminate).not.toHaveBeenCalled();
    expect(requestMessages().at(-1)).toEqual(
      expect.objectContaining({
        source: expect.objectContaining({ assetId: 'video-1', url: 'project-media://asset/video-1' }),
        visibleTimes: [2],
      }),
    );
  });

  it('isolates consumers with the same asset id but different source URLs', async () => {
    source.value = asset();
    await nextTick();
    const peer = mountAdditionalClient(asset({ src: 'project-media://asset/video-1-revision' }));
    await nextTick();

    api.requestVisibleFrames([1]);
    peer.api.requestVisibleFrames([1]);
    await flushPromises();

    expect(workerState.instances).toHaveLength(4);
    expect(requestMessages()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: expect.objectContaining({ assetId: 'video-1', url: 'project-media://asset/video-1' }),
          visibleTimes: [1],
        }),
        expect.objectContaining({
          source: expect.objectContaining({ assetId: 'video-1', url: 'project-media://asset/video-1-revision' }),
          visibleTimes: [1],
        }),
      ]),
    );
    const originalGeneration = latestRequestGeneration(0);
    const revisionGeneration = latestRequestGeneration(2);
    ready(originalGeneration, 1, new Blob(['original']), 0);
    ready(revisionGeneration, 1, new Blob(['revision']), 2);
    flushAnimationFrame();

    expect(api.thumbnails.value[1]).toBeTruthy();
    expect(peer.api.thumbnails.value[1]).toBeTruthy();
    expect(api.thumbnails.value[1]).not.toBe(peer.api.thumbnails.value[1]);
    expect(createObjectURL).toHaveBeenCalledTimes(2);

    peer.unmount();
    expect(workerAt(0).terminate).not.toHaveBeenCalled();
    expect(workerAt(1).terminate).not.toHaveBeenCalled();
    expect(workerAt(2).terminate).toHaveBeenCalledOnce();
    expect(workerAt(3).terminate).toHaveBeenCalledOnce();
  });

  it('does not post a queued request after disposal or revive thumbnails from late worker frames', async () => {
    const pendingClient = mountAdditionalClient(asset());
    pendingClient.api.requestVisibleFrames([11]);
    pendingClient.unmount();
    await flushPromises();
    expect(workerState.instances).toHaveLength(0);

    source.value = asset();
    await nextTick();
    api.requestVisibleFrames([12]);
    await flushPromises();
    const generation = latestRequestGeneration(0);
    ready(generation, 12, new Blob(['cached-before-dispose']));
    flushAnimationFrame();
    const cachedUrl = api.thumbnails.value[12];
    expect(cachedUrl).toBeTruthy();
    const objectUrlCount = createObjectURL.mock.calls.length;

    wrapper.unmount();
    ready(generation, 13, new Blob(['late-after-dispose']));
    flushAnimationFrame();

    expect(createObjectURL).toHaveBeenCalledTimes(objectUrlCount);
    expect(api.thumbnails.value[13]).toBeUndefined();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(cachedUrl);
  });

  it('recreates a crashed worker pair on the next visible request and ignores old responses', async () => {
    source.value = asset();
    await nextTick();
    api.requestVisibleFrames([1]);
    await flushPromises();
    const firstGeneration = latestRequestGeneration(0);
    const firstWorkers = [...workerState.instances];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    workerAt(0).onerror?.();
    expect(firstWorkers.map((worker) => worker.terminate.mock.calls.length)).toEqual([1, 1]);
    expect(api.isExtracting.value).toBe(false);
    expect(api.error.value).toBe('Timeline thumbnail decoding failed.');

    api.requestVisibleFrames([2]);
    await flushPromises();
    expect(workerState.instances).toHaveLength(4);
    const recoveredGeneration = latestRequestGeneration(2);
    expect(recoveredGeneration).toBeGreaterThan(firstGeneration);
    ready(firstGeneration, 1, new Blob(['stale-crash-frame']), 0);
    ready(recoveredGeneration, 2, new Blob(['recovered-frame']), 2);
    flushAnimationFrame();

    expect(api.thumbnails.value[1]).toBeUndefined();
    expect(api.thumbnails.value[2]).toBeTruthy();
    expect(api.error.value).toBeNull();
    expect(workerAt(2).terminate).not.toHaveBeenCalled();
    expect(workerAt(3).terminate).not.toHaveBeenCalled();
  });
});
