import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { CursorAssetDescriptor } from '~/api/types/cursor-pack';
import type { ScreenshotLayer } from '../../../screenshot-layer-types';
import type { ThumbnailReply, ThumbnailRequest } from '../thumbnail-types';

const dependencies = vi.hoisted(() => ({
  loadFonts: vi.fn(),
  loadImage: vi.fn(),
  render: vi.fn(),
  createImageLoader: vi.fn(),
}));
vi.mock('~/media/shared/element-fonts', () => ({ loadElementFonts: dependencies.loadFonts }));
vi.mock('../thumbnail-assets', () => ({
  createThumbnailImageLoader: dependencies.createImageLoader,
}));
vi.mock('../thumbnail-render', () => ({ renderLayerThumbnail: dependencies.render }));

import { createThumbnailWorker } from '../thumbnail-worker';

const asset: CursorAssetDescriptor = {
  id: 'pointer',
  label: 'Pointer',
  url: 'project-media://pointer.svg',
  format: 'svg',
  intrinsicSize: { width: 32, height: 32 },
  nominalSize: 32,
  hotspot: { x: 4, y: 2 },
};
const layer = (id: string, kind: ScreenshotLayer['kind'] = 'shape'): ScreenshotLayer => ({
  id,
  kind,
  name: id,
  visible: true,
  opacity: 100,
  blendMode: 'source-over',
  locked: false,
});
const request = (overrides: Partial<ThumbnailRequest> = {}): ThumbnailRequest => ({
  id: 'shape-1',
  revision: 1,
  state: { shapes: [], cursors: [] } as unknown as ScreenshotState,
  layer: layer('shape-1'),
  ...overrides,
});
const bitmap = (width = 32, height = 32) => ({ width, height, close: vi.fn() }) as unknown as ImageBitmap;
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.loadFonts.mockResolvedValue(undefined);
  dependencies.loadImage.mockResolvedValue({ width: 800, height: 450 } as ImageBitmap);
  dependencies.createImageLoader.mockReturnValue(dependencies.loadImage);
  dependencies.render.mockResolvedValue(new Blob(['preview'], { type: 'image/png' }));
});

afterEach(() => vi.restoreAllMocks());

describe('thumbnail worker queue', () => {
  it('loads a capture bitmap once for the request, waits for fonts, and posts a rendered blob', async () => {
    const replies: ThumbnailReply[] = [];
    const worker = createThumbnailWorker((reply) => replies.push(reply));
    const source = 'project-media://capture.png';
    const value = request({ id: 'screenshot', layer: layer('screenshot', 'image'), sourceUrl: source });
    const order: string[] = [];
    dependencies.loadFonts.mockImplementation(async () => order.push('fonts'));
    dependencies.render.mockImplementation(async () => {
      order.push('render');
      return new Blob(['rendered'], { type: 'image/png' });
    });

    worker(value);
    await vi.waitFor(() => expect(replies).toHaveLength(1));

    expect(dependencies.createImageLoader).toHaveBeenCalledOnce();
    expect(dependencies.loadImage).toHaveBeenCalledWith(source);
    expect(dependencies.loadFonts).toHaveBeenCalledWith(value.state.shapes);
    expect(dependencies.render).toHaveBeenCalledWith(
      value,
      expect.objectContaining({ image: expect.objectContaining({ width: 800, height: 450 }), width: 800, height: 450 }),
    );
    expect(order).toEqual(['fonts', 'render']);
    expect(replies[0]).toMatchObject({ id: 'screenshot', revision: 1, blob: expect.any(Blob) });
  });

  it.each([
    ['background', 'background'],
    ['watermark', 'logo'],
  ] as const)('places a loaded source in the %s asset slot', async (kind, slot) => {
    const replies: ThumbnailReply[] = [];
    const worker = createThumbnailWorker((reply) => replies.push(reply));
    const image = { width: 64, height: 48 } as ImageBitmap;
    dependencies.loadImage.mockResolvedValue(image);

    worker(
      request({
        id: kind,
        layer: layer(kind, kind),
        sourceUrl: `project-media://${kind}.png`,
      }),
    );
    await vi.waitFor(() => expect(replies).toHaveLength(1));

    expect(dependencies.render.mock.calls[0]![1]).toMatchObject({ [slot]: image });
  });

  it('passes a transferred cursor bitmap with its asset and always closes it after rendering', async () => {
    const replies: ThumbnailReply[] = [];
    const worker = createThumbnailWorker((reply) => replies.push(reply));
    const image = bitmap();
    const value = request({
      id: 'cursor-1',
      layer: layer('cursor-1', 'cursor'),
      bitmap: image,
      cursorAsset: asset,
      state: { shapes: [], cursors: [{ id: 'cursor-1' }] } as unknown as ScreenshotState,
    });

    worker(value);
    await vi.waitFor(() => expect(replies).toHaveLength(1));

    const assets = dependencies.render.mock.calls[0]![1] as {
      cursors: Map<string, { image: ImageBitmap; asset: CursorAssetDescriptor }>;
    };
    expect(assets.cursors.get('cursor-1')).toEqual({ image, asset });
    expect(image.close).toHaveBeenCalledOnce();
  });

  it('coalesces pending work by layer id, keeps requests serial, and closes replaced cursor bitmaps', async () => {
    const replies: ThumbnailReply[] = [];
    const worker = createThumbnailWorker((reply) => replies.push(reply));
    const gate = deferred<Blob>();
    const first = bitmap();
    const replaced = bitmap();
    const latest = bitmap();
    let active = 0;
    let maxActive = 0;
    dependencies.render
      .mockImplementationOnce(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        const result = await gate.promise;
        active -= 1;
        return result;
      })
      .mockImplementation(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        active -= 1;
        return new Blob(['latest'], { type: 'image/png' });
      });

    worker(
      request({ id: 'cursor-1', revision: 1, layer: layer('cursor-1', 'cursor'), bitmap: first, cursorAsset: asset }),
    );
    await vi.waitFor(() => expect(dependencies.render).toHaveBeenCalledOnce());
    worker(
      request({
        id: 'cursor-1',
        revision: 2,
        layer: layer('cursor-1', 'cursor'),
        bitmap: replaced,
        cursorAsset: asset,
      }),
    );
    worker(
      request({ id: 'cursor-1', revision: 3, layer: layer('cursor-1', 'cursor'), bitmap: latest, cursorAsset: asset }),
    );

    expect(replaced.close).toHaveBeenCalledOnce();
    expect(dependencies.render).toHaveBeenCalledOnce();
    gate.resolve(new Blob(['first'], { type: 'image/png' }));
    await vi.waitFor(() => expect(replies).toHaveLength(2));

    expect(replies.map((reply) => reply.revision)).toEqual([1, 3]);
    expect(dependencies.render).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
    expect(first.close).toHaveBeenCalledOnce();
    expect(latest.close).toHaveBeenCalledOnce();
  });

  it('reports image and render failures for their revision, then continues processing queued work', async () => {
    const replies: ThumbnailReply[] = [];
    const worker = createThumbnailWorker((reply) => replies.push(reply));
    dependencies.loadImage.mockRejectedValueOnce(new Error('decode failed'));
    dependencies.render.mockResolvedValueOnce(new Blob(['ok'], { type: 'image/png' }));

    worker(request({ id: 'bad-image', layer: layer('bad-image', 'image'), sourceUrl: 'bad.png' }));
    worker(request({ id: 'good-shape', layer: layer('good-shape', 'shape') }));
    await vi.waitFor(() => expect(replies).toHaveLength(2));

    expect(replies[0]).toMatchObject({ id: 'bad-image', revision: 1, error: 'decode failed' });
    expect(replies[1]).toMatchObject({ id: 'good-shape', revision: 1, blob: expect.any(Blob) });
    expect(dependencies.render).toHaveBeenCalledOnce();
  });

  it('converts non-Error worker failures to a readable reply', async () => {
    const replies: ThumbnailReply[] = [];
    const worker = createThumbnailWorker((reply) => replies.push(reply));
    dependencies.loadImage.mockRejectedValueOnce('raw image decode failure');

    worker(request({ id: 'bad-image', layer: layer('bad-image', 'image'), sourceUrl: 'bad.png' }));
    await vi.waitFor(() => expect(replies).toHaveLength(1));

    expect(replies[0]).toMatchObject({ id: 'bad-image', error: 'raw image decode failure' });
  });

  it('closes the active cursor bitmap and reports a font failure', async () => {
    const replies: ThumbnailReply[] = [];
    const worker = createThumbnailWorker((reply) => replies.push(reply));
    const image = bitmap();
    dependencies.loadFonts.mockRejectedValueOnce(new Error('font unavailable'));

    worker(
      request({
        id: 'cursor-1',
        layer: layer('cursor-1', 'cursor'),
        bitmap: image,
        cursorAsset: asset,
      }),
    );
    await vi.waitFor(() => expect(replies).toHaveLength(1));

    expect(replies[0]).toMatchObject({ id: 'cursor-1', error: 'font unavailable' });
    expect(image.close).toHaveBeenCalledOnce();
    expect(dependencies.render).not.toHaveBeenCalled();
  });
});
