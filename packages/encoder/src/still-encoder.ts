import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import { validScreenshotDimensions } from '@beam/engine/screenshot/screenshot-dimensions';
import type { ScreenshotRenderAssets } from '@beam/runtime/screenshot/screenshot-types';
import { drawScreenshot } from '@beam/runtime/screenshot/screenshot-render';
import { releaseCompositedLayerSurface } from '@beam/runtime/composition/render-composited-layer';
import type { StillEncodeOptions } from './still-encode-types';
import { StillEncodingError } from './still-encoding-error';

export async function encodeStillImage(
  state: ScreenshotState,
  assets: ScreenshotRenderAssets,
  options: StillEncodeOptions = {},
): Promise<ArrayBuffer> {
  if (!validScreenshotDimensions(state.canvas)) throw new StillEncodingError('dimensions');
  const canvas = new OffscreenCanvas(state.canvas.width, state.canvas.height);
  const context = canvas.getContext('2d');
  try {
    if (!context) throw new StillEncodingError('render-unavailable');
    drawScreenshot(context, state, assets, canvas.width, canvas.height);
    await options.onRendered?.(canvas);
    const type = `image/${state.format}`;
    const blob = await canvas.convertToBlob({
      type,
      quality: Math.max(0, Math.min(1, state.quality)),
    });
    if (blob.type !== type) throw new StillEncodingError('encoding-unavailable');
    return blob.arrayBuffer();
  } finally {
    if (context) releaseCompositedLayerSurface(context);
    canvas.width = 0;
    canvas.height = 0;
  }
}
