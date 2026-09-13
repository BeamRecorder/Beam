import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CursorAssetDescriptor, CursorPackDescriptor } from '~/api/types/cursor-pack';
import { loadCursorImage } from '../cursor-image-loader';

type ImageResult = 'load' | 'error' | 'pending' | 'throw';
interface ImageFixture {
  width: number;
  height: number;
  result?: ImageResult;
}

let imageFixtures: ImageFixture[];
let images: MockImage[];
let fetchMock: ReturnType<typeof vi.fn>;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let blobUrl = 0;
let assetId = 0;

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth: number;
  naturalHeight: number;
  private source = '';
  private readonly result: ImageResult;

  constructor() {
    const fixture = imageFixtures.shift() ?? { width: 1, height: 1 };
    this.naturalWidth = fixture.width;
    this.naturalHeight = fixture.height;
    this.result = fixture.result ?? 'load';
    images.push(this);
  }

  get src() {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
    if (!value || this.result === 'pending') return;
    if (this.result === 'throw') throw new Error('Image source rejected.');
    queueMicrotask(() => (this.result === 'error' ? this.onerror?.() : this.onload?.()));
  }
}

const response = (patch: Partial<Response> = {}) => ({
  ok: true,
  status: 200,
  text: vi.fn(async () => '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><path fill="#000"/></svg>'),
  blob: vi.fn(async () => new Blob(['cursor-image'])),
  ...patch,
});

const makePair = (
  format: CursorAssetDescriptor['format'] = 'svg',
  colorMode: CursorPackDescriptor['colorMode'] = 'tintable',
) => {
  const id = `cursor-cache-${++assetId}`;
  const asset: CursorAssetDescriptor = {
    id,
    label: id,
    url: `project-media://cursor/${id}.asset`,
    format,
    intrinsicSize: { width: 32, height: 16 },
    nominalSize: 32,
    hotspot: { x: 4, y: 3 },
  };
  const pack: CursorPackDescriptor = {
    id: `pack:${id}`,
    name: id,
    source: 'imported',
    colorMode,
    defaultCursorId: id,
    cursors: [asset],
    automaticMap: { default: id },
  };
  return { pack, asset };
};

const load = (
  pack: CursorPackDescriptor,
  asset: CursorAssetDescriptor,
  width = 32,
  height = 16,
  color = '#000000',
  options: Parameters<typeof loadCursorImage>[5] = {},
) => loadCursorImage(pack, asset, width, height, color, options);

beforeEach(() => {
  imageFixtures = [];
  images = [];
  blobUrl = 0;
  fetchMock = vi.fn(async () => response());
  createObjectURL = vi.fn(() => `blob:cursor-cache-${++blobUrl}`);
  revokeObjectURL = vi.fn();
  vi.stubGlobal('Image', MockImage);
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
});

afterEach(() => vi.unstubAllGlobals());

describe('shared cursor image cache', () => {
  it('bounds entry count with LRU eviction and leaves returned images untouched', async () => {
    const entries = Array.from({ length: 32 }, () => makePair('png', 'original'));
    const loaded: HTMLImageElement[] = [];
    for (const { pack, asset } of entries) loaded.push(await load(pack, asset));

    expect(fetchMock).toHaveBeenCalledTimes(32);
    expect(await load(entries[0]!.pack, entries[0]!.asset)).toBe(loaded[0]);
    const extra = makePair('png', 'original');
    await load(extra.pack, extra.asset);

    // Touching the first entry keeps it hot; the second becomes the LRU victim.
    expect(await load(entries[0]!.pack, entries[0]!.asset)).toBe(loaded[0]);
    const reloadedSecond = await load(entries[1]!.pack, entries[1]!.asset);
    expect(reloadedSecond).not.toBe(loaded[1]);
    expect(fetchMock).toHaveBeenCalledTimes(34);
    expect(loaded[0]!.src).not.toBe('');
    expect(loaded[0]!.naturalWidth).toBe(1);
  });

  it('does not retain an oversized raster or evict smaller useful entries', async () => {
    const useful = [makePair('png', 'original'), makePair('png', 'original')];
    const { pack, asset } = makePair('png', 'original');
    imageFixtures.push({ width: 1_000, height: 1_000 }, { width: 1_000, height: 1_000 });
    const cached: HTMLImageElement[] = [];
    for (const pair of useful) cached.push(await load(pair.pack, pair.asset));
    imageFixtures.push({ width: 5_000, height: 5_000 }, { width: 5_000, height: 5_000 });

    const first = await load(pack, asset);
    const second = await load(pack, asset);

    expect(second).not.toBe(first);
    expect(await load(useful[0]!.pack, useful[0]!.asset)).toBe(cached[0]);
    expect(await load(useful[1]!.pack, useful[1]!.asset)).toBe(cached[1]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('evicts least recently used entries when aggregate decoded pixels exceed the budget', async () => {
    const entries = Array.from({ length: 3 }, () => makePair('png', 'original'));
    imageFixtures.push(...Array.from({ length: 3 }, () => ({ width: 1_500, height: 1_000 })));
    const loaded: HTMLImageElement[] = [];
    for (const { pack, asset } of entries.slice(0, 2)) loaded.push(await load(pack, asset));

    expect(await load(entries[0]!.pack, entries[0]!.asset)).toBe(loaded[0]);
    const third = await load(entries[2]!.pack, entries[2]!.asset);
    expect(await load(entries[0]!.pack, entries[0]!.asset)).toBe(loaded[0]);
    expect(await load(entries[2]!.pack, entries[2]!.asset)).toBe(third);
    expect(await load(entries[1]!.pack, entries[1]!.asset)).not.toBe(loaded[1]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('coalesces concurrent loads for the same SVG variant', async () => {
    const { pack, asset } = makePair('svg', 'tintable');
    let resolveFetch!: (value: ReturnType<typeof response>) => void;
    const pendingResponse = new Promise<ReturnType<typeof response>>((resolve) => (resolveFetch = resolve));
    fetchMock.mockImplementationOnce(() => pendingResponse);

    const first = load(pack, asset, 64, 32, '#cc33ff');
    const second = load(pack, asset, 64, 32, '#cc33ff');
    expect(fetchMock).toHaveBeenCalledOnce();
    resolveFetch(response());

    const [firstImage, secondImage] = await Promise.all([first, second]);
    expect(secondImage).toBe(firstImage);
    expect(images).toHaveLength(1);
  });

  it('keys PNGs by source rather than raster size', async () => {
    const { pack, asset } = makePair('png', 'original');
    const first = await load(pack, asset, 32, 16);
    const second = await load(pack, asset, 1_920, 1_080, '#ff00ff');

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('keeps SVG raster size and tint as distinct shared-cache variants', async () => {
    const { pack, asset } = makePair('svg', 'tintable');
    const first = await load(pack, asset, 80, 40, '#ff0000');
    expect(await load(pack, asset, 80, 40, '#ff0000')).toBe(first);

    const resized = await load(pack, asset, 96, 48, '#ff0000');
    const retinted = await load(pack, asset, 96, 48, '#0000ff');

    expect(resized).not.toBe(first);
    expect(retinted).not.toBe(resized);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('shares an SVG variant for original-color artwork and defaults a missing format to SVG', async () => {
    const originalColor = makePair('svg', 'original');
    const first = await load(originalColor.pack, originalColor.asset, 32, 16, '#ff0000');
    expect(await load(originalColor.pack, originalColor.asset, 32, 16, '#0000ff')).toBe(first);

    const untyped = makePair('svg', 'tintable');
    const assetWithoutFormat = { ...untyped.asset };
    delete assetWithoutFormat.format;
    const untypedImage = await load(untyped.pack, assetWithoutFormat);

    expect(untypedImage).toBe(images[1]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache rejected fetches or image decodes and permits retry', async () => {
    const { pack, asset } = makePair('png', 'original');
    fetchMock.mockResolvedValueOnce(response({ ok: false, status: 503 }));
    await expect(load(pack, asset)).rejects.toThrow('Unable to load cursor asset:');

    imageFixtures.push({ width: 32, height: 16, result: 'error' });
    await expect(load(pack, asset)).rejects.toThrow('Unable to decode cursor asset:');

    const recovered = await load(pack, asset);
    expect(images).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(recovered).toBe(images[1]);
  });

  it('clears handlers and revokes the object URL when decoding is already aborted', async () => {
    const { pack, asset } = makePair('png', 'original');
    const controller = new AbortController();
    controller.abort();

    await expect(load(pack, asset, 32, 16, '#000000', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });

    expect(fetchMock).toHaveBeenCalledWith(asset.url, { signal: controller.signal });
    expect(images[0]!.src).toBe('');
    expect(images[0]!.onload).toBeNull();
    expect(images[0]!.onerror).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    const recovered = await load(pack, asset);
    expect(recovered).toBe(images[1]);
  });

  it('aborts a pending image decode, removes its cache entry, and allows retry', async () => {
    const { pack, asset } = makePair('png', 'original');
    const controller = new AbortController();
    imageFixtures.push({ width: 32, height: 16, result: 'pending' });
    const loading = load(pack, asset, 32, 16, '#000000', { signal: controller.signal });
    await vi.waitFor(() => expect(images).toHaveLength(1));

    controller.abort();
    await expect(loading).rejects.toMatchObject({ name: 'AbortError' });

    expect(images[0]!.src).toBe('');
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    const recovered = await load(pack, asset);
    expect(recovered).toBe(images[1]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('revokes the object URL when assigning an image source throws and allows retry', async () => {
    const { pack, asset } = makePair('png', 'original');
    imageFixtures.push({ width: 32, height: 16, result: 'throw' });

    await expect(load(pack, asset)).rejects.toThrow('Image source rejected.');

    expect(revokeObjectURL).toHaveBeenCalledOnce();
    const recovered = await load(pack, asset);
    expect(recovered).toBe(images[1]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not let an evicted request failure remove a newer cache entry for the same key', async () => {
    const pair = makePair('png', 'original');
    let rejectFirstFetch!: (reason: Error) => void;
    fetchMock.mockImplementationOnce(() => new Promise((_, reject) => (rejectFirstFetch = reject)));
    const stale = load(pair.pack, pair.asset);
    expect(fetchMock).toHaveBeenCalledOnce();

    const fillers = Array.from({ length: 32 }, () => makePair('png', 'original'));
    for (const filler of fillers) await load(filler.pack, filler.asset);
    const replacement = await load(pair.pack, pair.asset);
    rejectFirstFetch(new Error('old request failed'));
    await expect(stale).rejects.toThrow('old request failed');

    expect(await load(pair.pack, pair.asset)).toBe(replacement);
    expect(fetchMock).toHaveBeenCalledTimes(34);
  });

  it('bypasses both lookup and insertion when caching is disabled', async () => {
    const { pack, asset } = makePair('png', 'original');
    const first = await load(pack, asset, 32, 16, '#000000', { cache: false });
    const second = await load(pack, asset, 32, 16, '#000000', { cache: false });
    const cached = await load(pack, asset);

    expect(first).not.toBe(second);
    expect(cached).not.toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
