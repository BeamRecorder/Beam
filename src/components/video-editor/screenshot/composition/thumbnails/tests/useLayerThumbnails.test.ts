import { effectScope, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CursorAssetDescriptor, CursorPackDescriptor } from '~/api/types/cursor-pack';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { ScreenshotLayer } from '../../../screenshot-layer-types';
import type { LayerThumbnail, ThumbnailReply, ThumbnailSpec } from '../thumbnail-types';
import { useLayerThumbnails } from '../useLayerThumbnails';

const cursorRuntime = vi.hoisted(() => ({
  cursorGeometry: vi.fn(),
  loadCursorImage: vi.fn(),
}));

vi.mock('../../../../properties/cursor/cursor-packs', () => ({ cursorGeometry: cursorRuntime.cursorGeometry }));
vi.mock('../../../../properties/cursor/cursor-image-loader', () => ({
  loadCursorImage: cursorRuntime.loadCursorImage,
}));

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<ThumbnailReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    FakeWorker.instances.push(this);
  }

  reply(data: ThumbnailReply) {
    this.onmessage?.({ data } as MessageEvent<ThumbnailReply>);
  }

  fail() {
    this.onerror?.({} as ErrorEvent);
  }
}

const workerAt = (index = 0) => {
  const worker = FakeWorker.instances[index];
  if (!worker) throw new Error(`Expected thumbnail worker ${index}.`);
  return worker;
};

const makeState = (cursors: ScreenshotState['cursors'] = []): ScreenshotState =>
  ({
    canvas: { width: 1080, height: 1080 },
    background: null,
    blurPercent: 0,
    image: {},
    shapes: [],
    cursors,
    format: 'png',
    quality: 0.95,
  }) as unknown as ScreenshotState;

const makeLayer = (id: string, kind: ScreenshotLayer['kind'] = 'shape'): ScreenshotLayer => ({
  id,
  kind,
  name: id,
  opacity: 100,
  blendMode: 'source-over',
  locked: false,
  visible: true,
});

const makeSpec = (id: string, key: string, overrides: Partial<ThumbnailSpec> = {}): ThumbnailSpec => ({
  id,
  key,
  state: makeState(),
  layer: makeLayer(id),
  ...overrides,
});

const cursorAsset: CursorAssetDescriptor = {
  id: 'pointer',
  label: 'Pointer',
  url: 'cursor://pointer.svg',
  format: 'svg',
  tintable: true,
  intrinsicSize: { width: 32, height: 32 },
  nominalSize: 32,
  hotspot: { x: 8, y: 4 },
};
const cursorPack: CursorPackDescriptor = {
  id: 'pack:sample',
  name: 'Sample Pack',
  source: 'imported',
  colorMode: 'tintable',
  defaultCursorId: cursorAsset.id,
  cursors: [cursorAsset],
  automaticMap: { default: cursorAsset.id },
};
const makeCursorSpec = (id: string, key: string, overrides: Partial<ThumbnailSpec> = {}): ThumbnailSpec => {
  const cursor = {
    id,
    name: 'Pointer',
    enabled: true,
    position: { x: 0.5, y: 0.5 },
    size: 45,
    rotation: 0,
    selection: { packId: cursorPack.id, mode: 'fixed', cursorId: cursorAsset.id },
    color: '#ffffff',
    shadowEnabled: false,
    shadowBlur: 0,
    shadowColor: '#000000',
    shadowDirection: 'bottom-right',
  } as const;
  return makeSpec(id, key, {
    state: makeState([cursor]),
    layer: makeLayer(id, 'cursor'),
    cursorPack,
    cursorAsset,
    ...overrides,
  });
};

const makeBlob = (id: string) => new Blob([id], { type: 'image/png' });
const makeReply = (id: string, revision: number): ThumbnailReply => ({ id, revision, blob: makeBlob(id) });
const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
};

const scopes: Array<ReturnType<typeof effectScope>> = [];
const mountClient = (initial: ThumbnailSpec[]) => {
  const specs = ref(initial);
  const scope = effectScope();
  scopes.push(scope);
  const thumbnails = scope.run(() => useLayerThumbnails(() => specs.value))!;
  return { specs, thumbnails, scope };
};

const createObjectURL = vi.fn<(blob: Blob | MediaSource) => string>();
const revokeObjectURL = vi.fn<(url: string) => void>();
const createImageBitmapMock = vi.fn();
let objectUrlId = 0;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  FakeWorker.instances.length = 0;
  objectUrlId = 0;
  cursorRuntime.cursorGeometry.mockReturnValue({ width: 24, height: 32, hotspot: { x: 6, y: 8 } });
  cursorRuntime.loadCursorImage.mockResolvedValue({} as CanvasImageSource);
  createObjectURL.mockImplementation(() => `blob:thumbnail-${++objectUrlId}`);
  revokeObjectURL.mockImplementation(() => undefined);
  vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL);
  createImageBitmapMock.mockResolvedValue({ close: vi.fn() } as unknown as ImageBitmap);
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('createImageBitmap', createImageBitmapMock);
});

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useLayerThumbnails', () => {
  it('debounces requests for 80ms and sends only the latest pending version of a layer', async () => {
    const client = mountClient([makeSpec('shape-1', 'first', { sourceUrl: 'asset://first' })]);

    expect(client.thumbnails.value['shape-1']).toMatchObject({ status: 'loading', revision: 1 });
    await vi.advanceTimersByTimeAsync(40);
    client.specs.value = [makeSpec('shape-1', 'second', { sourceUrl: 'asset://latest' })];
    await nextTick();
    expect(client.thumbnails.value['shape-1']).toMatchObject({ status: 'loading', revision: 2 });

    await vi.advanceTimersByTimeAsync(79);
    expect(FakeWorker.instances).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);

    expect(workerAt().postMessage).toHaveBeenCalledOnce();
    expect(workerAt().postMessage.mock.calls[0]?.[0]).toMatchObject({
      id: 'shape-1',
      sourceUrl: 'asset://latest',
      layer: { name: 'shape-1' },
    });
  });

  it('updates only the layer whose key changed and ignores stale worker replies', async () => {
    const client = mountClient([makeSpec('shape-1', 'key-1'), makeSpec('shape-2', 'key-a')]);
    await vi.advanceTimersByTimeAsync(80);
    const worker = workerAt();
    expect(worker.postMessage).toHaveBeenCalledTimes(2);

    const oldRevision = client.thumbnails.value['shape-1']!.revision;
    const stableRevision = client.thumbnails.value['shape-2']!.revision;
    worker.reply(makeReply('shape-1', oldRevision));
    worker.reply(makeReply('shape-2', stableRevision));
    expect(client.thumbnails.value['shape-1']).toMatchObject({ status: 'ready', url: 'blob:thumbnail-1' });
    expect(client.thumbnails.value['shape-2']).toMatchObject({ status: 'ready', url: 'blob:thumbnail-2' });

    client.specs.value = [makeSpec('shape-1', 'key-2'), makeSpec('shape-2', 'key-a')];
    await nextTick();
    const newRevision = client.thumbnails.value['shape-1']!.revision;
    expect(newRevision).not.toBe(oldRevision);
    expect(client.thumbnails.value['shape-1']).toMatchObject({ status: 'loading', revision: newRevision });
    expect(client.thumbnails.value['shape-2']).toMatchObject({ status: 'ready', revision: stableRevision });
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:thumbnail-1');

    worker.reply(makeReply('shape-1', oldRevision));
    expect(client.thumbnails.value['shape-1']).toMatchObject({ status: 'loading', revision: newRevision });
    expect(createObjectURL).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(80);
    expect(worker.postMessage).toHaveBeenCalledTimes(3);
    worker.reply(makeReply('shape-1', newRevision));
    expect(client.thumbnails.value['shape-1']).toMatchObject({ status: 'ready', revision: newRevision });
    expect(client.thumbnails.value['shape-2']).toMatchObject({ status: 'ready', revision: stableRevision });
  });

  it('decodes a cursor before posting and closes the bitmap if that cursor becomes stale', async () => {
    let resolveOldImage!: (image: CanvasImageSource) => void;
    cursorRuntime.loadCursorImage.mockImplementationOnce(
      () => new Promise<CanvasImageSource>((resolve) => (resolveOldImage = resolve)),
    );
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    createImageBitmapMock.mockResolvedValue(bitmap);
    const client = mountClient([makeCursorSpec('cursor-1', 'old')]);

    await vi.advanceTimersByTimeAsync(80);
    expect(cursorRuntime.cursorGeometry).toHaveBeenCalledWith(cursorAsset, 384);
    expect(cursorRuntime.loadCursorImage).toHaveBeenCalledWith(cursorPack, cursorAsset, 24, 32, '#ffffff');
    expect(FakeWorker.instances).toHaveLength(0);

    client.specs.value = [makeCursorSpec('cursor-1', 'new')];
    await nextTick();
    const currentRevision = client.thumbnails.value['cursor-1']!.revision;
    resolveOldImage({} as CanvasImageSource);
    await flushMicrotasks();
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(FakeWorker.instances).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(80);
    await flushMicrotasks();
    expect(workerAt().postMessage).toHaveBeenCalledOnce();
    expect(workerAt().postMessage.mock.calls[0]?.[0]).toMatchObject({ id: 'cursor-1', revision: currentRevision });
    expect(workerAt().postMessage.mock.calls[0]?.[0].bitmap).toBe(bitmap);
    expect(workerAt().postMessage.mock.calls[0]?.[1]).toEqual([bitmap]);
  });

  it('ignores a cursor decode failure after its layer is removed or the client is disposed', async () => {
    for (const disposition of ['removed', 'disposed'] as const) {
      let rejectImage!: (reason: Error) => void;
      cursorRuntime.loadCursorImage.mockImplementationOnce(
        () => new Promise<CanvasImageSource>((_resolve, reject) => (rejectImage = reject)),
      );
      const id = `cursor-${disposition}`;
      const client = mountClient([makeCursorSpec(id, 'pending')]);
      await vi.advanceTimersByTimeAsync(80);

      if (disposition === 'removed') {
        client.specs.value = [];
        await nextTick();
      } else client.scope.stop();

      rejectImage(new Error('late cursor decode failure'));
      await flushMicrotasks();

      if (disposition === 'removed') expect(client.thumbnails.value[id]).toBeUndefined();
      else expect(client.thumbnails.value[id]).toMatchObject({ status: 'loading' });
    }
  });

  it.each([
    ['a cursor pack is missing', { cursorPack: undefined }],
    ['a cursor asset is missing', { cursorAsset: undefined }],
  ] as const)('surfaces a cursor decode error when %s', async (_label, overrides) => {
    const client = mountClient([makeCursorSpec('cursor-1', 'missing', overrides)]);

    await vi.advanceTimersByTimeAsync(80);

    expect(client.thumbnails.value['cursor-1']).toMatchObject({ status: 'error', error: 'Cursor pack unavailable.' });
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('surfaces cursor loader failures and closes a bitmap if posting the request throws', async () => {
    cursorRuntime.loadCursorImage.mockRejectedValueOnce('cursor decode failed');
    const client = mountClient([makeCursorSpec('cursor-error', 'decode')]);
    await vi.advanceTimersByTimeAsync(80);
    expect(client.thumbnails.value['cursor-error']).toMatchObject({ status: 'error', error: 'cursor decode failed' });
    expect(FakeWorker.instances).toHaveLength(0);

    const postingClient = mountClient([makeSpec('seed', 'seed')]);
    await vi.advanceTimersByTimeAsync(80);
    const worker = workerAt();
    worker.postMessage.mockClear();
    worker.postMessage.mockImplementationOnce(() => {
      throw new Error('post failed');
    });
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    createImageBitmapMock.mockResolvedValue(bitmap);
    postingClient.specs.value = [makeCursorSpec('cursor-post', 'post')];
    await nextTick();
    await vi.advanceTimersByTimeAsync(80);
    await flushMicrotasks();

    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(postingClient.thumbnails.value['cursor-post']).toMatchObject({ status: 'error', error: 'post failed' });
  });

  it('handles worker reply and worker runtime errors, then creates a fresh worker for a later request', async () => {
    const client = mountClient([makeSpec('shape-error', 'first'), makeSpec('shape-runtime', 'second')]);
    await vi.advanceTimersByTimeAsync(80);
    const worker = workerAt();
    const errorRevision = client.thumbnails.value['shape-error']!.revision;
    worker.reply({ id: 'shape-error', revision: errorRevision, error: 'thumbnail render failed' });
    expect(client.thumbnails.value['shape-error']).toMatchObject({
      status: 'error',
      error: 'thumbnail render failed',
    });

    worker.fail();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(client.thumbnails.value['shape-runtime']).toMatchObject({
      status: 'error',
      error: 'Thumbnail worker failed.',
    });

    client.specs.value = [makeSpec('shape-runtime', 'retry')];
    await nextTick();
    await vi.advanceTimersByTimeAsync(80);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(workerAt(1).postMessage).toHaveBeenCalledOnce();
  });

  it('revokes removed URLs and cleans the worker, pending debounce, and remaining URLs on scope disposal', async () => {
    const client = mountClient([makeSpec('shape-ready', 'ready'), makeSpec('shape-remains', 'remains')]);
    await vi.advanceTimersByTimeAsync(80);
    const worker = workerAt();
    const readyRevision = client.thumbnails.value['shape-ready']!.revision;
    const remainingRevision = client.thumbnails.value['shape-remains']!.revision;
    worker.reply(makeReply('shape-ready', readyRevision));
    worker.reply(makeReply('shape-remains', remainingRevision));
    const readyUrl = (client.thumbnails.value['shape-ready'] as LayerThumbnail).url!;
    const remainingUrl = (client.thumbnails.value['shape-remains'] as LayerThumbnail).url!;

    client.specs.value = [makeSpec('shape-remains', 'remains')];
    await nextTick();
    expect(client.thumbnails.value['shape-ready']).toBeUndefined();
    expect(revokeObjectURL).toHaveBeenCalledWith(readyUrl);

    client.specs.value = [makeSpec('shape-pending', 'pending')];
    await nextTick();
    await vi.advanceTimersByTimeAsync(40);
    const postCount = worker.postMessage.mock.calls.length;
    client.scope.stop();
    await vi.advanceTimersByTimeAsync(80);

    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenCalledTimes(postCount);
    expect(revokeObjectURL).toHaveBeenCalledWith(readyUrl);
    expect(revokeObjectURL).toHaveBeenCalledWith(remainingUrl);
    worker.reply(makeReply('shape-ready', readyRevision));
    expect(createObjectURL).toHaveBeenCalledTimes(2);
  });
});
