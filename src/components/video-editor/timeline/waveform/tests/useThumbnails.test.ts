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
    vi.restoreAllMocks();
  });

  const ready = (generation: number, time: number, blob = new Blob([String(time)])) => {
    workerState.instances[0]?.onmessage?.({
      data: { type: 'frame-ready', generation, time, blob },
    } as MessageEvent);
  };

  it('queues visible frames, extracts missing thumbnails, and retains visible entries in the bounded cache', async () => {
    source.value = asset();
    await nextTick();
    api.requestVisibleFrames([1, 2, 1]);
    await flushPromises();

    const worker = workerState.instances[0]!;
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'request-frames',
      generation: 1,
      source: {
        assetId: 'video-1',
        kind: 'video',
        label: 'Recording',
        url: 'project-media://asset/video-1',
      },
      visibleTimes: [1, 2],
    });

    worker.onmessage?.({
      data: { type: 'batch-started', generation: 1 },
    } as MessageEvent);
    expect(api.isExtracting.value).toBe(true);
    ready(1, 1);
    expect(api.thumbnails[1]).toContain('blob:');
    ready(1, 1, new Blob(['replacement']));
    expect(revokeObjectURL).toHaveBeenCalled();
    worker.onmessage?.({
      data: { type: 'batch-finished', generation: 1 },
    } as MessageEvent);
    expect(api.isExtracting.value).toBe(false);

    api.requestVisibleFrames([1]);
    await flushPromises();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);

    for (let time = 2; time <= 181; time += 1) ready(1, time);
    expect(api.thumbnails[1]).toBeDefined();
    expect(Object.keys(api.thumbnails)).toHaveLength(96);

    worker.onmessage?.({
      data: { type: 'error', generation: 1, message: 'failed' },
    } as MessageEvent);
    expect(api.isExtracting.value).toBe(false);
    expect(api.error.value).toBe('failed');
    worker.onerror?.();
    expect(api.isExtracting.value).toBe(false);
    expect(api.error.value).toBe('Timeline thumbnail decoding failed.');
  });

  it('keeps the currently visible thumbnail when the bounded cache receives more frames', async () => {
    source.value = asset();
    await nextTick();
    api.requestVisibleFrames([1]);
    await flushPromises();
    ready(1, 1);

    for (let time = 2; time <= 181; time += 1) ready(1, time);

    expect(api.thumbnails[1]).toBeDefined();
    expect(Object.keys(api.thumbnails)).toHaveLength(96);
  });

  it('ignores stale generations and clears pending work when the asset changes', async () => {
    source.value = asset();
    await nextTick();
    api.requestVisibleFrames([4]);
    await flushPromises();
    const worker = workerState.instances[0]!;
    ready(999, 4);
    expect(api.thumbnails[4]).toBeUndefined();

    api.clearCache();
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'clear',
      generation: 2,
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
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      type: 'request-frames',
      generation: 4,
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

    const worker = workerState.instances[0]!;
    expect(worker.postMessage).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ generation: 1, visibleTimes: [4, 5] }));
  });

  it('keeps one generation while scrolling and increments it only when the source changes', async () => {
    source.value = asset();
    await nextTick();
    api.requestVisibleFrames([1]);
    await flushPromises();
    api.requestVisibleFrames([2]);
    await flushPromises();

    const worker = workerState.instances[0]!;
    expect(worker.postMessage.mock.calls.map(([message]) => message.generation)).toEqual([1, 1]);

    source.value = asset({ id: 'video-2', src: 'project-media://asset/video-2' });
    await nextTick();
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'clear', generation: 2 });
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
    const worker = workerState.instances[0]!;
    worker.onmessage?.({
      data: { type: 'error', generation: 1, message: 'decoder failed' },
    } as MessageEvent);
    expect(api.error.value).toBe('decoder failed');

    api.requestVisibleFrames([4]);
    await flushPromises();
    expect(api.error.value).toBeNull();

    api.clearCache();
    expect(api.error.value).toBeNull();
    expect(api.isExtracting.value).toBe(false);
  });

  it('returns early for empty sources and clears cached object URLs on source changes and unmount', async () => {
    api.requestVisibleFrames([1]);
    await flushPromises();
    expect(workerState.instances).toHaveLength(0);

    source.value = asset();
    await nextTick();
    api.requestVisibleFrames([1]);
    await flushPromises();
    ready(1, 1);
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
    ready(1, 1);
    const postCount = worker.postMessage.mock.calls.length;
    const revokeCount = revokeObjectURL.mock.calls.length;

    source.value = asset();
    await nextTick();

    expect(api.thumbnails[1]).toBeDefined();
    expect(worker.postMessage).toHaveBeenCalledTimes(postCount);
    expect(revokeObjectURL).toHaveBeenCalledTimes(revokeCount);

    source.value = asset({ id: 'video-2', src: 'project-media://asset/video-2' });
    await nextTick();
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'clear', generation: 2 });
    expect(revokeObjectURL.mock.calls.length).toBeGreaterThan(revokeCount);
    expect(api.thumbnails[1]).toBeUndefined();
  });
});
