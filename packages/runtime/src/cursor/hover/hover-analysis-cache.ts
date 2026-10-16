import { validateCursorHoverSync } from '@beam/engine/cursor/cursor-hover-sync';
import type { CursorHoverSync } from '@beam/engine/cursor/cursor-hover-types';
import { mediaSourceDescriptor } from '../../shared/media-source';
import type { HoverAnalysisInput } from './hover-types';

const CACHE_NAME = 'beam-cursor-hover-v1';
const MAX_ENTRY_BYTES = 1024 * 1024;
const MAX_ENTRIES = 16;

export async function hoverCacheKey(input: HoverAnalysisInput): Promise<string> {
  const sources = input.sources.map((source) => ({
    ...source,
    src: mediaSourceDescriptor({ id: source.id, name: source.id, kind: 'video', src: source.src }).url,
  }));
  const pathHash = await crypto.subtle.digest('SHA-256', input.path as Float64Array<ArrayBuffer>);
  const hex = (buffer: ArrayBuffer) =>
    [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('');
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify([1, sources, hex(pathHash)])),
  );
  return `https://beam.invalid/cursor-hover/v1/${hex(hash)}`;
}

/** Optional, bounded acceleration. Cache failure never disguises an analysis failure. */
export async function readHoverCache(key: string): Promise<CursorHoverSync | undefined> {
  if (!globalThis.caches) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(key);
    if (!response) return;
    const text = await response.text();
    if (text.length > MAX_ENTRY_BYTES) throw new Error('Oversized cursor analysis cache.');
    const sync: unknown = JSON.parse(text);
    validateCursorHoverSync(sync);
    return sync;
  } catch (error) {
    console.warn('[Beam cursor] Analysis cache read failed.', error);
  }
}

export async function writeHoverCache(key: string, sync: CursorHoverSync): Promise<void> {
  if (!globalThis.caches) return;
  validateCursorHoverSync(sync);
  const text = JSON.stringify(sync);
  if (text.length > MAX_ENTRY_BYTES) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(key, new Response(text, { headers: { 'Content-Type': 'application/json' } }));
    const keys = await cache.keys();
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) await cache.delete(old);
  } catch (error) {
    console.warn('[Beam cursor] Analysis cache write failed.', error);
  }
}
