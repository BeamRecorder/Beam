import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  UrlSource: vi.fn(),
  sources: [] as Array<{
    url: string;
    options: unknown;
    owner: { free: ReturnType<typeof vi.fn> };
    refs: Array<{ free: ReturnType<typeof vi.fn> }>;
    ref: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('mediabunny', () => ({ UrlSource: runtime.UrlSource }));

import { mediaSourceDescriptor, MediaSourcePool, URL_SOURCE_CACHE_BYTES } from '../media-source';
import { MediaInputError } from '../media-types';

const asset = (overrides: Partial<{ id: string; kind: 'video' | 'audio' | 'image'; name: string; src: string }>) => ({
  id: 'asset-1',
  kind: 'video' as const,
  name: 'Example',
  src: 'https://cdn.example.test/video.mp4',
  ...overrides,
});

const descriptor = (
  overrides: Partial<{ assetId: string; kind: 'video' | 'audio'; url: string; label: string }> = {},
) => ({
  assetId: 'asset-1',
  kind: 'video' as const,
  url: 'https://cdn.example.test/video.mp4',
  label: 'Example',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  runtime.sources.length = 0;
  runtime.UrlSource.mockImplementation(function UrlSourceMock(url: string, options: unknown) {
    const source = {
      url,
      options,
      owner: { free: vi.fn() },
      refs: [] as Array<{ free: ReturnType<typeof vi.fn> }>,
      ref: vi.fn(),
    };
    source.ref.mockImplementation(() => {
      const ref = { free: vi.fn() };
      source.refs.push(ref);
      return ref;
    });
    runtime.sources.push(source);
    return source;
  });
});

describe('mediaSourceDescriptor', () => {
  it.each([
    ['http', 'http://example.test/video.mp4'],
    ['https', 'https://example.test/video.mp4'],
    ['project-media', 'project-media://project/video.mp4'],
  ])('accepts %s media URLs and preserves the normalized href', (_scheme, src) => {
    expect(mediaSourceDescriptor(asset({ src }))).toEqual({
      assetId: 'asset-1',
      kind: 'video',
      label: 'Example',
      url: new URL(src).href,
    });
  });

  it.each(['file:///tmp/video.mp4', 'blob:https://example.test/id', 'data:video/mp4;base64,AAAA'])(
    'rejects the unapproved URL scheme %s',
    (src) => {
      expect(() => mediaSourceDescriptor(asset({ src }))).toThrow(MediaInputError);
      expect(() => mediaSourceDescriptor(asset({ src }))).toThrow('approved project URL');
    },
  );

  it('rejects an absent source and image assets before URL parsing', () => {
    try {
      mediaSourceDescriptor(asset({ src: '' }));
      throw new Error('expected missing source to throw');
    } catch (error) {
      expect(error).toMatchObject({ detail: { kind: 'missing', sourceId: 'asset-1' } });
    }
    try {
      mediaSourceDescriptor(asset({ kind: 'image' }));
      throw new Error('expected image source to throw');
    } catch (error) {
      expect(error).toMatchObject({ detail: { kind: 'missing-track', track: 'video', sourceId: 'asset-1' } });
    }
  });
});

describe('MediaSourcePool', () => {
  it('shares one URL source while independently counting leases', () => {
    const pool = new MediaSourcePool();
    const first = pool.acquire(descriptor());
    const second = pool.acquire(descriptor());

    expect(pool.size).toBe(1);
    expect(runtime.UrlSource).toHaveBeenCalledOnce();
    expect(runtime.UrlSource).toHaveBeenCalledWith(descriptor().url, { maxCacheSize: URL_SOURCE_CACHE_BYTES });
    expect(runtime.sources[0]?.refs).toHaveLength(3);

    first.release();
    expect(pool.size).toBe(1);
    expect(runtime.sources[0]?.refs[0]?.free).not.toHaveBeenCalled();
    second.release();
    expect(pool.size).toBe(0);
    expect(runtime.sources[0]?.refs[0]?.free).toHaveBeenCalledOnce();
  });

  it('makes lease release idempotent and creates a fresh source after the last release', () => {
    const pool = new MediaSourcePool();
    const lease = pool.acquire(descriptor());
    lease.release();
    lease.release();
    expect(runtime.sources[0]?.refs[0]?.free).toHaveBeenCalledOnce();

    const replacement = pool.acquire(descriptor());
    expect(replacement).toBeDefined();
    expect(runtime.UrlSource).toHaveBeenCalledTimes(2);
    replacement.release();
    expect(runtime.sources[1]?.refs[0]?.free).toHaveBeenCalledOnce();
  });

  it('keys entries by asset and URL, disposes all active entries, and uses a 16 MiB cache', () => {
    const pool = new MediaSourcePool();
    pool.acquire(descriptor({ assetId: 'asset-a' }));
    pool.acquire(descriptor({ assetId: 'asset-b' }));
    pool.acquire(descriptor({ assetId: 'asset-a', url: 'https://cdn.example.test/other.mp4' }));

    expect(pool.size).toBe(3);
    expect(URL_SOURCE_CACHE_BYTES).toBe(16 * 2 ** 20);
    pool.dispose();
    expect(pool.size).toBe(0);
    for (const source of runtime.sources) expect(source.refs[0]?.free).toHaveBeenCalledOnce();
    pool.dispose();
    for (const source of runtime.sources) expect(source.refs[0]?.free).toHaveBeenCalledOnce();
  });
});
