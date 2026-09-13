import type { createThumbnailSource } from './thumbnail-source';

export interface SharedThumbnailSource {
  source: ReturnType<typeof createThumbnailSource>;
  requests: Map<symbol, number[]>;
  queued: boolean;
}
