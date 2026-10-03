import { projectFontSource } from '~/api/project-font-source';
import { loadElementFonts } from '@beam/runtime/shared/element-font-loader';
import type { ScreenshotRenderAssets } from '@beam/runtime/screenshot/screenshot-types';
import { createThumbnailImageLoader } from './thumbnail-assets';
import { renderLayerThumbnail } from './thumbnail-render';
import type { ThumbnailRequest, ThumbnailReply, ThumbnailWorkerMessage } from './thumbnail-types';

export function createThumbnailWorker(post: (reply: ThumbnailReply) => void) {
  const loadImage = createThumbnailImageLoader();
  const pending = new Map<string, ThumbnailRequest>();
  let running = false;
  const drain = async () => {
    running = true;
    while (pending.size) {
      const request = pending.values().next().value!;
      pending.delete(request.id);
      try {
        const assets: Partial<ScreenshotRenderAssets> = {};
        if (request.bitmap && request.cursorAsset)
          assets.cursors = new Map([[request.id, { image: request.bitmap, asset: request.cursorAsset }]]);
        if (request.sourceUrl) {
          const asset = await loadImage(request.sourceUrl);
          const { image } = asset;
          if (request.layer.kind === 'image')
            Object.assign(assets, {
              ...asset,
              rasterSize: { width: image.width, height: image.height },
            });
          else if (request.layer.kind === 'background') assets.background = image;
          else if (request.layer.kind === 'watermark') assets.logo = image;
        }
        await loadElementFonts(request.state.shapes, projectFontSource);
        const blob = await renderLayerThumbnail(request, assets);
        post({ id: request.id, revision: request.revision, blob });
      } catch (reason) {
        post({
          id: request.id,
          revision: request.revision,
          error: reason instanceof Error ? reason.message : String(reason),
        });
      } finally {
        request.bitmap?.close();
      }
    }
    running = false;
  };
  return (request: ThumbnailWorkerMessage) => {
    if ('type' in request) {
      const keep = new Set(request.ids);
      for (const [id, queued] of pending)
        if (!keep.has(id)) {
          queued.bitmap?.close();
          pending.delete(id);
        }
      return;
    }
    pending.get(request.id)?.bitmap?.close();
    pending.set(request.id, request);
    if (!running) void drain();
  };
}
