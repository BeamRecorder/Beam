import { renderHtmlThumbnail } from './html-thumbnail-frame';
import type { HtmlThumbnailRequest, HtmlThumbnailResponse } from './html-thumbnail-types';

self.onmessage = async ({ data }: MessageEvent<HtmlThumbnailRequest>) => {
  const id = data?.id;
  if (!Number.isSafeInteger(id) || id < 1) return;
  let response: HtmlThumbnailResponse;
  try {
    response = { id, blob: await renderHtmlThumbnail(data) };
  } catch (error) {
    response = { id, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(response);
};
