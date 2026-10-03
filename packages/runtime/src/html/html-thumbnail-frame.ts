import type { HtmlThumbnailRequest } from './html-thumbnail-types';

export async function renderHtmlThumbnail(request: HtmlThumbnailRequest): Promise<Blob> {
  const url = new URL(request.url);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !/^\/frame\/[0-9a-f]{64}$/.test(url.pathname))
    throw new Error('Invalid HTML thumbnail capability.');
  if (
    !Number.isFinite(request.timeMs) ||
    request.timeMs < 0 ||
    ![240, 480, 960].includes(request.width) ||
    !Number.isInteger(request.height) ||
    request.height < 1 ||
    request.height > 32768
  )
    throw new Error('Invalid HTML thumbnail dimensions or clock.');
  url.searchParams.set('timeMs', String(request.timeMs));
  url.searchParams.set('width', String(request.width));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTML thumbnail rendering failed (${response.status}).`);
  const bitmap = await createImageBitmap(await response.blob(), {
    resizeWidth: request.width,
    resizeHeight: request.height,
  });
  try {
    const canvas = new OffscreenCanvas(request.width, request.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('HTML thumbnail canvas unavailable.');
    context.drawImage(bitmap, 0, 0);
    return await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
  } finally {
    bitmap.close();
  }
}
