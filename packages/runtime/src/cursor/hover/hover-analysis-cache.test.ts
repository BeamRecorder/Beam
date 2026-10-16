import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hoverCacheKey, readHoverCache, writeHoverCache } from './hover-analysis-cache';

const input = () => ({
  sources: [{ id: 'a', src: 'https://localhost/a.mp4', startSeconds: 0, durationSeconds: 2 }],
  path: new Float64Array([0, 0, 0, 1]),
});
const sync = { version: 1 as const, ranges: [{ startSeconds: 1, endSeconds: 2 }] };
function fixture() {
  const entries = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (key: string) => entries.get(key)?.clone()),
    put: vi.fn(async (key: string, response: Response) => {
      entries.set(key, response);
    }),
    keys: vi.fn(async () => [...entries.keys()]),
    delete: vi.fn(async (key: string) => entries.delete(key)),
  };
  const open = vi.fn(async () => cache);
  vi.stubGlobal('caches', { open });
  return { entries, cache, open };
}
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('bounded optional hover cache', () => {
  it('hashes recording identity, source timing and pointer bytes deterministically', async () => {
    const original = await hoverCacheKey(input());
    expect(await hoverCacheKey(input())).toBe(original);
    for (const data of [
      { ...input(), path: new Float64Array([0, 0.1, 0, 1]) },
      { ...input(), sources: [{ ...input().sources[0]!, startSeconds: 1 }] },
      { ...input(), sources: [{ ...input().sources[0]!, src: 'https://localhost/b.mp4' }] },
    ])
      expect(await hoverCacheKey(data)).not.toBe(original);
  });
  it('treats an unavailable cache or missing entry as no analysis result', async () => {
    vi.stubGlobal('caches', undefined);
    expect(await readHoverCache('a')).toBeUndefined();
    await writeHoverCache('a', sync);
    const f = fixture();
    expect(await readHoverCache('a')).toBeUndefined();
    expect(f.cache.match).toHaveBeenCalled();
  });
  it('roundtrips validated results and prunes oldest entries to a bounded count', async () => {
    const f = fixture();
    for (let index = 0; index < 20; index++) await writeHoverCache(`https://beam.invalid/${index}`, sync);
    expect(f.entries.size).toBe(16);
    expect(f.cache.delete).toHaveBeenCalledTimes(4);
    expect(await readHoverCache('https://beam.invalid/19')).toEqual(sync);
  });
  it.each(['broken json', JSON.stringify({ version: 2, ranges: [] }), 'x'.repeat(1024 * 1024 + 1)])(
    'rejects corrupt or oversized cached content',
    async (content) => {
      const f = fixture();
      f.entries.set('a', new Response(content));
      expect(await readHoverCache('a')).toBeUndefined();
      expect(console.warn).toHaveBeenCalledOnce();
    },
  );
  it('does not cache excessively large results or invalid metadata', async () => {
    const f = fixture();
    const huge = {
      version: 1 as const,
      ranges: Array.from({ length: 30_000 }, (_, i) => ({ startSeconds: i * 2, endSeconds: i * 2 + 1 })),
    };
    await writeHoverCache('a', huge);
    expect(f.cache.put).not.toHaveBeenCalled();
    await expect(writeHoverCache('a', { version: 1, ranges: [{ startSeconds: 2, endSeconds: 1 }] })).rejects.toThrow();
  });
  it('reports storage failures without returning fake synchronization data', async () => {
    const f = fixture();
    f.open.mockRejectedValue(new Error('disk full'));
    expect(await readHoverCache('a')).toBeUndefined();
    await expect(writeHoverCache('a', sync)).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledTimes(2);
  });
});
