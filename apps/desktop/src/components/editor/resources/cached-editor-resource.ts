import type { CachedEditorResource } from './editor-resource-types';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Cached metadata is owned here; editors receive independent mutable copies. */
export function createCachedEditorResource<T>(read: () => Promise<T>): CachedEditorResource<T> {
  let value: T | undefined;
  let pending: Promise<T> | undefined;
  let generation = 0;
  let disposed = false;
  const assertLive = () => {
    if (disposed) throw new DOMException('Editor resources disposed.', 'AbortError');
  };
  const owned = (): Promise<T> => {
    assertLive();
    if (value !== undefined) return Promise.resolve(value);
    if (pending) return pending;
    const current = generation;
    const request = (async () => read())()
      .then(
        (next) => {
          assertLive();
          if (current !== generation) return owned();
          value = clone(next);
          return value;
        },
        (reason: unknown) => {
          assertLive();
          if (current !== generation) return owned();
          throw reason;
        },
      )
      .finally(() => {
        if (pending === request) pending = undefined;
      });
    pending = request;
    return request;
  };
  const invalidate = () => {
    generation++;
    value = undefined;
    pending = undefined;
  };
  return {
    async get() {
      return clone(await owned());
    },
    invalidate,
    replace(next) {
      assertLive();
      invalidate();
      value = clone(next);
    },
    dispose() {
      disposed = true;
      invalidate();
    },
  };
}
