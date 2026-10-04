import { expect, it, vi } from 'vitest';
import { createCachedEditorResource } from './cached-editor-resource';

const deferred = <T>() => {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
it('coalesces concurrent reads and gives each editor an independent metadata copy', async () => {
  const source = { items: ['original'] };
  const read = vi.fn(async () => source);
  const cache = createCachedEditorResource(read);
  const [first, second] = await Promise.all([cache.get(), cache.get()]);
  first.items.push('draft');
  source.items.push('external mutation');
  expect(second).toEqual({ items: ['original'] });
  expect(await cache.get()).toEqual(second);
  expect(read).toHaveBeenCalledOnce();
});
it('invalidates an empty catalogue and reads its new contents once', async () => {
  const read = vi.fn().mockResolvedValueOnce([]).mockResolvedValue(['new']);
  const cache = createCachedEditorResource<string[]>(read);
  expect(await cache.get()).toEqual([]);
  expect(await cache.get()).toEqual([]);
  cache.invalidate();
  expect(await cache.get()).toEqual(['new']);
  expect(read).toHaveBeenCalledTimes(2);
});
it.each(['resolve', 'reject'] as const)(
  'ignores a stale %s after invalidation and joins the current read',
  async (outcome) => {
    const old = deferred<string[]>(),
      current = deferred<string[]>();
    const read = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const cache = createCachedEditorResource<string[]>(read);
    const first = cache.get();
    await Promise.resolve();
    cache.invalidate();
    const second = cache.get();
    await Promise.resolve();
    if (outcome === 'resolve') old.resolve(['stale']);
    else old.reject(new Error('stale failure'));
    current.resolve(['latest']);
    expect(await first).toEqual(['latest']);
    expect(await second).toEqual(['latest']);
    expect(read).toHaveBeenCalledTimes(2);
  },
);
it('retains changed-event data over an older read and owns the replacement value', async () => {
  const old = deferred<{ version: number }>();
  const read = vi.fn(() => old.promise);
  const cache = createCachedEditorResource(read);
  const pending = cache.get();
  await Promise.resolve();
  const replacement = { version: 2 };
  cache.replace(replacement);
  replacement.version = 100;
  old.resolve({ version: 1 });
  expect(await pending).toEqual({ version: 2 });
  expect(await cache.get()).toEqual({ version: 2 });
  expect(read).toHaveBeenCalledOnce();
});
it('does not retain a failed read and retries on the next request', async () => {
  const read = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(['recovered']);
  const cache = createCachedEditorResource(read);
  await expect(cache.get()).rejects.toThrow('unavailable');
  expect(await cache.get()).toEqual(['recovered']);
});
it.each(['resolve', 'reject'] as const)('rejects late %s results and further reads after disposal', async (outcome) => {
  const job = deferred<string[]>();
  const cache = createCachedEditorResource(() => job.promise);
  const pending = cache.get();
  await Promise.resolve();
  cache.dispose();
  cache.dispose();
  if (outcome === 'resolve') job.resolve(['late']);
  else job.reject(new Error('late error'));
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await expect(cache.get()).rejects.toMatchObject({ name: 'AbortError' });
  expect(() => cache.replace([])).toThrow('disposed');
});
