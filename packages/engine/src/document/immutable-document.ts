const owned = new WeakSet<object>();

/** Freeze newly owned records once. Unchanged subtrees are shared by commands and history. */
export function freezeDocument<T>(value: T): T {
  if (!value || typeof value !== 'object' || owned.has(value)) return value;
  for (const child of Object.values(value)) freezeDocument(child);
  Object.freeze(value);
  owned.add(value);
  return value;
}

export function forkComposition<T extends { clips: unknown[]; assets: unknown[] }>(document: T): T {
  return { ...document, clips: [...document.clips], assets: [...document.assets] };
}
