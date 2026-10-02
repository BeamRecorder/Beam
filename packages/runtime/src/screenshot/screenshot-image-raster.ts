import type { ScreenshotImageFraming } from '@beam/runtime/screenshot/screenshot-types';
import type { ScreenshotImageAsset } from '@beam/runtime/screenshot/screenshot-types';

/** Keep the layout intrinsic; only source sampling uses the smaller bitmap. */
export function screenshotImageRaster(
  framing: ScreenshotImageFraming,
  asset: Pick<ScreenshotImageAsset, 'width' | 'height' | 'rasterSize'>,
): ScreenshotImageFraming {
  if (!asset.rasterSize) return framing;
  const scaleX = asset.rasterSize.width / asset.width;
  const scaleY = asset.rasterSize.height / asset.height;
  return {
    rect: framing.rect,
    sourceSize: {
      width: framing.sourceRect.width,
      height: framing.sourceRect.height,
    },
    sourceRect: {
      x: framing.sourceRect.x * scaleX,
      y: framing.sourceRect.y * scaleY,
      width: framing.sourceRect.width * scaleX,
      height: framing.sourceRect.height * scaleY,
    },
  };
}
