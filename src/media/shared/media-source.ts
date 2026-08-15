import { UrlSource, type SourceRef } from 'mediabunny';
import type { MediaAsset } from './composition-types';
import { MediaInputError, type MediaSourceDescriptor, type MediaSourceLease } from './media-types';

const URL_SOURCE_CACHE_BYTES = 16 * 2 ** 20;
const FILE_MEDIA_SCHEMES = new Set(['http:', 'https:', 'project-media:']);

export function mediaSourceDescriptor(asset: Pick<MediaAsset, 'id' | 'kind' | 'name' | 'src'>): MediaSourceDescriptor {
  if (asset.kind === 'image') {
    throw new MediaInputError({
      kind: 'missing-track',
      sourceId: asset.id,
      track: 'video',
      message: 'Image assets are not decodable media inputs.',
    });
  }
  if (!asset.src) {
    throw new MediaInputError({ kind: 'missing', sourceId: asset.id, message: 'The media asset is unavailable.' });
  }
  let url: URL;
  try {
    url = new URL(asset.src, globalThis.location?.href);
  } catch {
    throw new MediaInputError({
      kind: 'missing',
      sourceId: asset.id,
      message: 'The media asset URL is invalid.',
    });
  }
  if (!FILE_MEDIA_SCHEMES.has(url.protocol)) {
    throw new MediaInputError({
      kind: 'missing',
      sourceId: asset.id,
      message: 'The media asset does not use an approved project URL.',
    });
  }
  return { assetId: asset.id, kind: asset.kind, label: asset.name, url: url.href };
}

type SourceEntry = {
  owner: SourceRef<UrlSource>;
  source: UrlSource;
  users: number;
};

export class MediaSourcePool {
  private readonly entries = new Map<string, SourceEntry>();

  acquire(descriptor: MediaSourceDescriptor): MediaSourceLease {
    const key = `${descriptor.assetId}:${descriptor.url}`;
    let entry = this.entries.get(key);
    if (!entry) {
      const source = new UrlSource(descriptor.url, { maxCacheSize: URL_SOURCE_CACHE_BYTES });
      entry = { owner: source.ref(), source, users: 0 };
      this.entries.set(key, entry);
    }
    entry.users += 1;
    let released = false;
    return {
      ref: entry.source.ref(),
      release: () => {
        if (released) return;
        released = true;
        const current = this.entries.get(key);
        if (!current) return;
        current.users -= 1;
        if (current.users === 0) {
          this.entries.delete(key);
          current.owner.free();
        }
      },
    };
  }

  dispose(): void {
    for (const entry of this.entries.values()) entry.owner.free();
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

export const mediaSourcePool = new MediaSourcePool();
export { URL_SOURCE_CACHE_BYTES };
