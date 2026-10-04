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
  const size = options.outputSize ?? state.canvas;
  if (!validScreenshotDimensions(size)) throw new StillEncodingError('dimensions');
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext('2d');
  const measure = async <T>(stage: 'thumbnail' | 'encode' | 'bytes', action: () => T | Promise<T>): Promise<T> => {
    const start = performance.now();
    try {
      return await action();
    } finally {
      options.onTiming?.(stage, performance.now() - start);
    }
  };
  let blob: Blob;
  try {
    if (!context) throw new StillEncodingError('render-unavailable');
    const start = performance.now();
    try {
      drawScreenshot(context, state, assets, canvas.width, canvas.height);
    } finally {
      options.onTiming?.('render', performance.now() - start);
    }
    if (options.onRendered) await measure('thumbnail', () => options.onRendered!(canvas));
    const type = `image/${state.format}`;
    blob = await measure('encode', () =>
      canvas.convertToBlob({
        type,
        quality: Math.max(0, Math.min(1, state.quality)),
      }),
    );
    if (blob.type !== type) throw new StillEncodingError('encoding-unavailable');
  } finally {
    if (context) releaseCompositedLayerSurface(context);
    canvas.width = 0;
    canvas.height = 0;
  }
  return await measure('bytes', () => blob.arrayBuffer());
}
