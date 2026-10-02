import type { createThumbnailSource } from './thumbnail-source';

export interface SharedThumbnailSource {
  source: ReturnType<typeof createThumbnailSource>;
  requests: Map<symbol, { times: number[]; width: number }>;
  queued: boolean;
}
