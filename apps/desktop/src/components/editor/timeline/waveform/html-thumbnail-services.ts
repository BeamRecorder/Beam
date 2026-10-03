import HtmlThumbnailWorker from '@beam/runtime/html/html-thumbnail.worker?worker';
import { createHtmlThumbnailClient } from '@beam/runtime/html/html-thumbnail-client';
import type { HtmlComposition } from '@beam/engine/html/html-types';
import type { HtmlThumbnailServices } from './html-thumbnail-types';

export function createHtmlThumbnailServices(html: HtmlComposition): HtmlThumbnailServices {
  const client = createHtmlThumbnailClient(new HtmlThumbnailWorker(), async () => {
    const { capture } = await import('~/api/capture');
    const [source] = await capture.getHtmlFrameSources([{ id: html.id, html }]);
    if (!source) throw new Error('HTML thumbnail source unavailable.');
    return source.url;
  });
  return {
    render: (timeMs, width) =>
      client.render(timeMs, width, Math.max(1, Math.round((width * html.height) / html.width))),
    createUrl: (blob) => URL.createObjectURL(blob),
    revokeUrl: (url) => URL.revokeObjectURL(url),
    dispose: () => client.dispose(),
  };
}
