import { defineComponent, nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearBackgroundPreviewCache, useBackgroundPreviews } from './useBackgroundPreviews';
import type { BackgroundMedia } from '../../composables/backgroundCatalog';
import { resolvePublicAssetUrl } from '~/utils/public-asset';

const runtime = vi.hoisted(() => ({
  decodeVideoPoster: vi.fn(),
  mediaSourceDescriptor: vi.fn((asset: { id: string; src: string; name: string }) => ({
    assetId: asset.id,
    kind: 'video',
    url: asset.src,
    label: asset.name,
  })),
}));

vi.mock('~/media/playback', () => ({ decodeVideoPoster: runtime.decodeVideoPoster }));
vi.mock('~/media/shared', () => ({ mediaSourceDescriptor: runtime.mediaSourceDescriptor }));

const workerState = vi.hoisted(() => {
  const instances: Array<{
    onmessage?: (event: MessageEvent) => void;
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
  }> = [];
  class FakeWorker {
    onmessage?: (event: MessageEvent) => void;
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor() {
      instances.push(this);
    }
  }
  return { FakeWorker, instances };
});

vi.mock('./background-preview.worker?worker&inline', () => ({ default: workerState.FakeWorker }));

const image = (id: string): BackgroundMedia => ({
  id,
  name: id,
  path: `/media/${id}.png`,
  extension: 'png',
  kind: 'image',
});
const video = (id: string): BackgroundMedia => ({
  id,
  name: id,
  path: `/media/${id}.mp4`,
  extension: 'mp4',
  kind: 'video',
});

const frame = () => ({
  bitmap: {} as CanvasImageSource,
  width: 240,
  height: 180,
  close: vi.fn(),
});

describe('useBackgroundPreviews', () => {
  let api: ReturnType<typeof useBackgroundPreviews>;
  let wrapper: ReturnType<typeof mount>;
  const createObjectURL = vi.fn<(blob: Blob | MediaSource) => string>();
  const revokeObjectURL = vi.fn<(url: string) => void>();

  beforeEach(() => {
    vi.clearAllMocks();
    clearBackgroundPreviewCache();
    workerState.instances.length = 0;
    runtime.decodeVideoPoster.mockResolvedValue(frame());
    createObjectURL.mockImplementation(() => `blob:${createObjectURL.mock.calls.length}`);
    revokeObjectURL.mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['frame'])));
    const Harness = defineComponent({
      setup() {
        api = useBackgroundPreviews();
        return () => null;
      },
    });
    wrapper = mount(Harness);
  });

  afterEach(() => {
    wrapper.unmount();
    clearBackgroundPreviewCache();
    vi.restoreAllMocks();
  });

  it('requests image previews, handles worker messages, deduplicates and evicts cached entries', () => {
    const worker = workerState.instances[0]!;
    api.request(image('first'));
    api.request(image('first'));
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'request',
      id: 'first',
      source: resolvePublicAssetUrl('/media/first.png'),
    });

    worker.onmessage?.({ data: { type: 'ready', id: 'first', preview: new Blob(['one']) } } as MessageEvent);
    expect(api.previews.first).toContain('blob:');
    api.request(image('first'));
    expect(worker.postMessage).toHaveBeenCalledTimes(1);

    worker.onmessage?.({ data: { type: 'ready', id: 'first', preview: new Blob(['replacement']) } } as MessageEvent);
    expect(revokeObjectURL).toHaveBeenCalled();
    worker.onmessage?.({ data: { type: 'error', id: 'broken' } } as MessageEvent);
    expect(api.failed.broken).toBe(true);
    api.request(image('broken'));
    expect(worker.postMessage).toHaveBeenCalledTimes(1);

    for (let index = 0; index < 180; index += 1) {
      worker.onmessage?.({
        data: { type: 'ready', id: `cached-${index}`, preview: new Blob([String(index)]) },
      } as MessageEvent);
    }
    expect(Object.keys(api.previews)).toHaveLength(180);
    expect(api.previews.first).toBeUndefined();
  });

  it('decodes video previews from a Mediabunny poster frame without creating a video element', async () => {
    const createElement = vi.spyOn(document, 'createElement');
    api.request(video('movie'));
    await flushPromises();

    expect(runtime.mediaSourceDescriptor).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'movie', kind: 'video', src: resolvePublicAssetUrl('/media/movie.mp4') }),
    );
    expect(runtime.decodeVideoPoster).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'movie', kind: 'video' }),
      { position: 0.5, width: 240, height: 180, fit: 'cover' },
    );
    expect(api.previews.movie).toContain('blob:');
    expect(createElement.mock.calls.some(([tag]) => tag.toLowerCase() === 'video')).toBe(false);
    expect(runtime.decodeVideoPoster.mock.results[0]!.value).toBeInstanceOf(Promise);
  });

  it('serializes video preview generation and starts queued work after success', async () => {
    let resolveFirst!: (value: ReturnType<typeof frame>) => void;
    let resolveSecond!: (value: ReturnType<typeof frame>) => void;
    const first = new Promise<ReturnType<typeof frame>>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<ReturnType<typeof frame>>((resolve) => {
      resolveSecond = resolve;
    });
    runtime.decodeVideoPoster.mockReset();
    runtime.decodeVideoPoster.mockReturnValueOnce(first).mockReturnValueOnce(second);

    api.request(video('first'));
    api.request(video('second'));
    api.request(video('second'));
    expect(runtime.decodeVideoPoster).toHaveBeenCalledTimes(1);
    resolveFirst(frame());
    await flushPromises();
    expect(api.previews.first).toContain('blob:');
    expect(runtime.decodeVideoPoster).toHaveBeenCalledTimes(2);
    expect(api.previews.second).toBeUndefined();

    resolveSecond(frame());
    await flushPromises();
    expect(api.previews.second).toContain('blob:');
  });

  it('starts the next queued video after an error and marks the failed item', async () => {
    runtime.decodeVideoPoster.mockReset();
    runtime.decodeVideoPoster.mockRejectedValueOnce(new Error('decode failed')).mockResolvedValueOnce(frame());
    api.request(video('broken'));
    api.request(video('queued'));
    await flushPromises();
    expect(api.failed.broken).toBe(true);
    expect(runtime.decodeVideoPoster).toHaveBeenCalledTimes(2);
    await flushPromises();
    expect(api.previews.queued).toContain('blob:');
  });

  it('terminates its worker when unmounted and persists cached previews across mounts', async () => {
    const worker = workerState.instances[0]!;
    api.request(image('cleanup'));
    worker.onmessage?.({ data: { type: 'ready', id: 'cleanup', preview: new Blob(['cleanup']) } } as MessageEvent);
    expect(api.previews.cleanup).toBeDefined();
    wrapper.unmount();
    await nextTick();
    expect(worker.terminate).toHaveBeenCalled();

    // Remounting immediately re-uses the cached preview without needing another request
    const api2 = useBackgroundPreviews();
    expect(api2.previews.cleanup).toBeDefined();
  });
});
