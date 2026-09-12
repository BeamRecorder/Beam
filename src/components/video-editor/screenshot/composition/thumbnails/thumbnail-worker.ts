import { loadElementFonts } from '~/media/shared/element-fonts';
import type { ScreenshotRenderAssets } from '../../screenshot-types';
import { createThumbnailImageLoader } from './thumbnail-assets';
import { renderLayerThumbnail } from './thumbnail-render';
import type { ThumbnailRequest, ThumbnailReply } from './thumbnail-types';

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
          const image = await loadImage(request.sourceUrl);
          if (request.layer.kind === 'image')
            Object.assign(assets, { image, width: image.width, height: image.height });
          else if (request.layer.kind === 'background') assets.background = image;
          else if (request.layer.kind === 'watermark') assets.logo = image;
        }
        await loadElementFonts(request.state.shapes);
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
  return (request: ThumbnailRequest) => {
    pending.get(request.id)?.bitmap?.close();
    pending.set(request.id, request);
    if (!running) void drain();
  };
}
