import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimelineArtworkImages } from '../timeline-artwork-images';

class FakeImage {
  naturalWidth = 0;
  naturalHeight = 0;
  complete = false;
  src = '';
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  load(width = 8, height = 4) {
    this.naturalWidth = width;
    this.naturalHeight = height;
    this.complete = true;
    this.onload?.(new Event('load'));
  }

  fail() {
    this.onerror?.(new Event('error'));
  }
}

const owned: TimelineArtworkImages[] = [];
function setup(options: { maxEntries?: number; maxBytes?: number } = {}) {
  const images: FakeImage[] = [];
  const createImage = vi.fn(() => {
    const image = new FakeImage();
    images.push(image);
    return image as unknown as HTMLImageElement;
  });
  const cache = new TimelineArtworkImages({ ...options, createImage });
  owned.push(cache);
  const acquire = (url: string) => {
    const lease = cache.acquire(url);
    // Releasing or disposing a pending borrow can reject it. Observe that
    // rejection immediately, while retaining the original promise for assertions.
    void lease.ready.catch(() => {});
    return lease;
  };
  return { cache, images, createImage, acquire };
}

afterEach(() => {
  for (const cache of owned.splice(0)) cache.dispose();
  vi.unstubAllGlobals();
});

describe('TimelineArtworkImages shared loading', () => {
  it('protects an active image even if its factory fires onload synchronously during src assignment', async () => {
    const image = new FakeImage(); let source = '';
    Object.defineProperty(image, 'src', { get: () => source, set: (value: string) => { source = value; if (value) image.load(2, 2); } });
    const cache = new TimelineArtworkImages({ maxBytes: 4, createImage: () => image as unknown as HTMLImageElement });
    owned.push(cache);
    const lease = cache.acquire('immediately-ready');
    await expect(lease.ready).resolves.toBe(image);
    expect(cache.stats()).toEqual({ entries: 1, bytes: 16, active: 1 });
    expect(image.src).toBe('immediately-ready');
    lease.release(); expect(cache.stats()).toEqual({ entries: 0, bytes: 0, active: 0 });
  });

  it('does not revive an entry after a synchronous src-assignment error', async () => {
    const image = new FakeImage(); let source = '';
    Object.defineProperty(image, 'src', { get: () => source, set: (value: string) => { source = value; if (value) image.fail(); } });
    const cache = new TimelineArtworkImages({ createImage: () => image as unknown as HTMLImageElement });
    owned.push(cache);
    const lease = cache.acquire('immediately-failed');
    await expect(lease.ready).rejects.toThrow('failed');
    expect(cache.stats()).toEqual({ entries: 0, bytes: 0, active: 0 });
    expect(image).toMatchObject({ src: '', onload: null, onerror: null });
    lease.release(); expect(cache.stats()).toEqual({ entries: 0, bytes: 0, active: 0 });
  });

  it('starts empty and coalesces pending acquisitions by the exact URL', async () => {
    const { cache, images, createImage, acquire } = setup();
    expect(cache.stats()).toEqual({ entries: 0, bytes: 0, active: 0 });
    const first = acquire('blob:thumbnail');
    const second = acquire('blob:thumbnail');
    expect(first.ready).toBe(second.ready);
    expect(createImage).toHaveBeenCalledOnce();
    expect(images[0]!.src).toBe('blob:thumbnail');
    expect(cache.stats()).toEqual({ entries: 1, bytes: 0, active: 1 });
    images[0]!.load();
    await expect(first.ready).resolves.toBe(images[0]);
    await expect(second.ready).resolves.toBe(images[0]);
    first.release();
    second.release();
  });

  it('reuses a decoded image after the last borrower releases it', async () => {
    const { cache, images, createImage, acquire } = setup();
    const first = acquire('data:image/png;base64,artwork');
    images[0]!.load(10, 5);
    await first.ready;
    first.release();
    expect(cache.stats()).toEqual({ entries: 1, bytes: 200, active: 0 });
    const next = acquire('data:image/png;base64,artwork');
    expect(next.ready).toBe(first.ready);
    await expect(next.ready).resolves.toBe(images[0]);
    expect(createImage).toHaveBeenCalledOnce();
    next.release();
  });

  it('keeps distinct source URLs separate even when their pixels have equal dimensions', async () => {
    const { cache, images, createImage, acquire } = setup();
    const first = acquire('project-media://asset/first.png');
    const second = acquire('project-media://asset/second.png');
    images[0]!.load(16, 8);
    images[1]!.load(16, 8);
    expect(first.ready).not.toBe(second.ready);
    await expect(first.ready).resolves.toBe(images[0]);
    await expect(second.ready).resolves.toBe(images[1]);
    expect(createImage).toHaveBeenCalledTimes(2);
    expect(cache.stats()).toMatchObject({ entries: 2, bytes: 1024 });
  });

  it('uses the browser image factory when no factory is supplied', async () => {
    const images: FakeImage[] = [];
    vi.stubGlobal(
      'Image',
      class extends FakeImage {
        constructor() {
          super();
          images.push(this);
        }
      },
    );
    const cache = new TimelineArtworkImages();
    owned.push(cache);
    const lease = cache.acquire('blob:default');
    images[0]!.load();
    await expect(lease.ready).resolves.toBe(images[0]);
    lease.release();
  });
});

describe('TimelineArtworkImages refcount and budgets', () => {
  it('protects a shared active image until every distinct borrower releases it', async () => {
    const { cache, images, acquire } = setup({ maxEntries: 1, maxBytes: 64 });
    const first = acquire('shared');
    const second = acquire('shared');
    const other = acquire('other');
    images[0]!.load(4, 4);
    images[1]!.load(4, 4);
    await Promise.all([first.ready, second.ready, other.ready]);
    first.release();
    first.release();
    expect(cache.stats()).toEqual({ entries: 2, bytes: 128, active: 2 });
    expect(images[0]!.src).toBe('shared');
    second.release();
    expect(cache.stats()).toEqual({ entries: 1, bytes: 64, active: 1 });
    expect(images[0]!.src).toBe('');
    expect(images[1]!.src).toBe('other');
    other.release();
    expect(cache.stats().active).toBe(0);
  });

  it('evicts the least recently borrowed inactive image at the entry-count boundary', async () => {
    const { cache, images, acquire } = setup({ maxEntries: 2 });
    const first = acquire('first');
    images[0]!.load();
    await first.ready;
    first.release();
    const second = acquire('second');
    images[1]!.load();
    await second.ready;
    second.release();
    const refreshFirst = acquire('first');
    await refreshFirst.ready;
    refreshFirst.release();
    const third = acquire('third');
    images[2]!.load();
    await third.ready;
    third.release();
    expect(cache.stats()).toEqual({ entries: 2, bytes: 256, active: 0 });
    expect(images[0]!.src).toBe('first');
    expect(images[1]!.src).toBe('');
    expect(images[2]!.src).toBe('third');
  });

  it('accounts natural dimensions as RGBA bytes and evicts on the byte budget', async () => {
    const { cache, images, acquire } = setup({ maxEntries: 10, maxBytes: 192 });
    const first = acquire('small');
    images[0]!.load(4, 4);
    await first.ready;
    first.release();
    const second = acquire('wide');
    images[1]!.load(8, 4);
    await second.ready;
    second.release();
    expect(cache.stats()).toEqual({ entries: 2, bytes: 192, active: 0 });
    const third = acquire('new');
    images[2]!.load(4, 4);
    await third.ready;
    third.release();
    expect(cache.stats()).toEqual({ entries: 2, bytes: 192, active: 0 });
    expect(images[0]!.src).toBe('');
    expect(images[1]!.src).toBe('wide');
  });

  it('allows a borrowed oversized image but releases it immediately when no longer active', async () => {
    const { cache, images, acquire } = setup({ maxBytes: 32 });
    const lease = acquire('large');
    images[0]!.load(10, 10);
    await lease.ready;
    expect(cache.stats()).toMatchObject({ entries: 1, bytes: 400 });
    expect(images[0]!.src).toBe('large');
    lease.release();
    lease.release();
    expect(cache.stats()).toEqual({ entries: 0, bytes: 0, active: 0 });
    expect(images[0]!.src).toBe('');
  });

  it('supports the smallest budget without evicting an oversized image while it is borrowed', async () => {
    const { cache, images, acquire } = setup({ maxEntries: 1, maxBytes: 4 });
    const lease = acquire('temporary');
    images[0]!.load(1, 2);
    await lease.ready;
    expect(cache.stats()).toEqual({ entries: 1, bytes: 8, active: 1 });
    lease.release();
    expect(cache.stats()).toEqual({ entries: 0, bytes: 0, active: 0 });
    const replacement = acquire('temporary');
    images[1]!.load(1, 1);
    await replacement.ready;
    expect(replacement.ready).not.toBe(lease.ready);
    replacement.release();
  });

  it('clears event handlers as well as source pixels when evicting an inactive image', async () => {
    const { images, acquire } = setup({ maxBytes: 4 });
    const lease = acquire('artwork');
    images[0]!.load();
    await lease.ready;
    lease.release();
    expect(images[0]).toMatchObject({ src: '', onload: null, onerror: null });
  });

  it('retains exactly 96 idle images under the default count budget', async () => {
    const { cache, images, acquire } = setup();
    for (let index = 0; index < 97; index += 1) {
      const lease = acquire(`thumbnail-${index}`);
      images[index]!.load(1, 1);
      await lease.ready;
      lease.release();
    }
    expect(cache.stats()).toEqual({ entries: 96, bytes: 384, active: 0 });
    expect(images[0]!.src).toBe('');
    expect(images[96]!.src).toBe('thumbnail-96');
  });

  it('retains the default 16 MiB exactly but evicts idle pixels when another image exceeds it', async () => {
    const { cache, images, acquire } = setup();
    const full = acquire('full-budget');
    images[0]!.load(2048, 2048);
    await full.ready;
    full.release();
    expect(cache.stats()).toEqual({ entries: 1, bytes: 16 * 1024 * 1024, active: 0 });
    const next = acquire('extra');
    images[1]!.load(1, 1);
    await next.ready;
    next.release();
    expect(cache.stats()).toEqual({ entries: 1, bytes: 4, active: 0 });
    expect(images[0]!.src).toBe('');
  });
});

describe('TimelineArtworkImages errors and disposal', () => {
  it.each([[0, 10], [10, 0], [-1, 10], [10, -1], [Number.NaN, 10], [10, Number.POSITIVE_INFINITY], [1.5, 10], [10, Number.MAX_SAFE_INTEGER + 1]])(
    'rejects unusable decoded dimensions %s × %s without corrupting the cache',
    async (width, height) => {
      const { cache, images, acquire } = setup();
      const lease = acquire('invalid-dimensions');
      images[0]!.load(width, height);
      await expect(lease.ready).rejects.toThrow('dimensions');
      expect(cache.stats()).toEqual({ entries: 0, bytes: 0, active: 0 });
      expect(images[0]).toMatchObject({ src: '', onload: null, onerror: null });
      lease.release();
    },
  );

  it('rejects every borrower of a failed image and removes it from retained statistics', async () => {
    const { cache, images, acquire } = setup();
    const first = acquire('broken');
    const second = acquire('broken');
    const failures = Promise.all([expect(first.ready).rejects.toThrow(), expect(second.ready).rejects.toThrow()]);
    images[0]!.fail();
    await failures;
    expect(cache.stats()).toEqual({ entries: 0, bytes: 0, active: 0 });
    expect(images[0]).toMatchObject({ src: '', onload: null, onerror: null });
    first.release();
    second.release();
    expect(cache.stats()).toEqual({ entries: 0, bytes: 0, active: 0 });
  });

  it('retries the same URL after failure without an old release deleting the new entry', async () => {
    const { cache, images, createImage, acquire } = setup();
    const failed = acquire('retry');
    images[0]!.fail();
    await expect(failed.ready).rejects.toThrow();
    const replacement = acquire('retry');
    failed.release();
    images[1]!.load(2, 3);
    await expect(replacement.ready).resolves.toBe(images[1]);
    expect(cache.stats()).toMatchObject({ entries: 1, bytes: 24 });
    expect(createImage).toHaveBeenCalledTimes(2);
    replacement.release();
  });

  it('evicts an abandoned pending request and ignores its late callbacks after URL replacement', async () => {
    const { cache, images, acquire } = setup({ maxEntries: 1 });
    const abandoned = acquire('abandoned');
    const oldLoad = images[0]!.onload;
    const oldError = images[0]!.onerror;
    abandoned.release();
    const active = acquire('active');
    images[1]!.load(1, 1);
    await active.ready;
    await expect(abandoned.ready).rejects.toThrow();
    expect(images[0]).toMatchObject({ src: '', onload: null, onerror: null });
    const replacement = acquire('abandoned');
    images[2]!.load(2, 2);
    await replacement.ready;
    oldLoad?.(new Event('load'));
    oldError?.(new Event('error'));
    expect(cache.stats()).toEqual({ entries: 2, bytes: 20, active: 2 });
    expect(images[2]!.src).toBe('abandoned');
    active.release();
    expect(cache.stats()).toEqual({ entries: 1, bytes: 16, active: 1 });
    replacement.release();
  });

  it('disposes both pending and ready images and rejects the pending acquisition', async () => {
    const { cache, images, acquire } = setup();
    const ready = acquire('ready');
    images[0]!.load();
    await ready.ready;
    const pending = acquire('pending');
    cache.dispose();
    await expect(pending.ready).rejects.toThrow();
    expect(cache.stats()).toEqual({ entries: 0, bytes: 0, active: 0 });
    for (const image of images) expect(image).toMatchObject({ src: '', onload: null, onerror: null });
    ready.release();
    pending.release();
    cache.dispose();
    expect(cache.stats()).toEqual({ entries: 0, bytes: 0, active: 0 });
  });

  it('ignores late load and error callbacks captured before disposal', async () => {
    const { cache, images, acquire } = setup();
    const pending = acquire('late');
    const oldLoad = images[0]!.onload;
    const oldError = images[0]!.onerror;
    cache.dispose();
    await expect(pending.ready).rejects.toThrow();
    images[0]!.naturalWidth = 100;
    images[0]!.naturalHeight = 100;
    oldLoad?.(new Event('load'));
    oldError?.(new Event('error'));
    expect(cache.stats()).toEqual({ entries: 0, bytes: 0, active: 0 });
    expect(images[0]!.src).toBe('');
    pending.release();
  });

  it('never creates new source images after the registry is disposed', () => {
    const { cache, createImage } = setup();
    cache.dispose();
    expect(() => cache.acquire('after-dispose')).toThrow('disposed');
    expect(createImage).not.toHaveBeenCalled();
    expect(cache.stats()).toEqual({ entries: 0, bytes: 0, active: 0 });
  });

  it('handles disposal of an empty registry repeatedly', () => {
    const { cache, createImage } = setup();
    cache.dispose();
    cache.dispose();
    expect(cache.stats()).toEqual({ entries: 0, bytes: 0, active: 0 });
    expect(createImage).not.toHaveBeenCalled();
  });
});

describe('TimelineArtworkImages limits', () => {
  it.each([-1, 0, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid entry limit: %s',
    (maxEntries) => expect(() => new TimelineArtworkImages({ maxEntries })).toThrow(RangeError),
  );

  it.each([-1, 0, 3, 4.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid byte limit: %s',
    (maxBytes) => expect(() => new TimelineArtworkImages({ maxBytes })).toThrow(RangeError),
  );
});
