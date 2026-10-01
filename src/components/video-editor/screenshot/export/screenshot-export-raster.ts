import type { ScreenshotState } from '~/api/types/screenshot';
import type { ScreenshotDimensions } from '../screenshot-types';
import { screenshotImageFraming } from '../screenshot-geometry';

/** Keep two source samples per output pixel, including the most demanding crop of a shared image. */
export function screenshotExportRasterScale(
  state: ScreenshotState,
  source: string,
  url: string,
  size: ScreenshotDimensions,
) {
  const { width, height } = state.canvas;
  let scale = 0;
  const images = [
    ...(url === source ? [state.image] : []),
    ...(state.images ?? []).filter((image) => image.source === url),
  ];
  for (const image of images) {
    if (!image.enabled) continue;
    const frame = screenshotImageFraming({ ...state, image }, size.width, size.height, width, height);
    scale = Math.max(scale, frame.rect.width / frame.sourceRect.width, frame.rect.height / frame.sourceRect.height);
  }
  if (state.canvas.showBackground && state.background?.kind === 'image' && state.background.path === url)
    scale = Math.max(scale, width / size.width, height / size.height);
  return Math.min(1, scale * 2);
}
