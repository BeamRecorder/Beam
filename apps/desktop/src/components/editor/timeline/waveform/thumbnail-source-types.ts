import type { createThumbnailSource } from './thumbnail-source';
import type { createHtmlThumbnailSource } from './html-thumbnail-source';

export interface SharedThumbnailSource {
  source: ReturnType<typeof createThumbnailSource> | ReturnType<typeof createHtmlThumbnailSource>;
  requests: Map<symbol, { times: number[]; width: number }>;
  queued: boolean;
}
