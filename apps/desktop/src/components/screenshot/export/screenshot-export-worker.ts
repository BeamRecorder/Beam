import { encodeStillImage } from '@beam/encoder/still-encoder';
import { StillEncodingError } from '@beam/encoder/still-encoding-error';
import { validScreenshotDimensions } from '@beam/engine/screenshot/screenshot-dimensions';
import { projectFontSource } from '~/api/project-font-source';
import { loadElementFonts } from '@beam/runtime/shared/element-font-loader';
import type { ScreenshotExportReply, ScreenshotExportRequest } from './screenshot-export-types';
import { createScreenshotExportImages } from './screenshot-export-images';
import { screenshotExportPreview } from './screenshot-export-preview';
import type { ScreenshotWorkerOptions } from './screenshot-export-types';

export async function renderScreenshotExport(
  request: ScreenshotExportRequest,
  options: ScreenshotWorkerOptions = {},
): Promise<ArrayBuffer> {
  const { state, decorations } = request;
  const loader = createScreenshotExportImages(request);
  const images = new Set([decorations.logo, ...[...(decorations.cursors?.values() ?? [])].map(({ image }) => image)]);
  const measure = async <T>(stage: string, action: () => Promise<T>) => {
    const start = performance.now();
    try {
      return await action();
    } finally {
      options.onTiming?.(stage, performance.now() - start);
    }
  };
  try {
    if (!validScreenshotDimensions(state.canvas)) throw new Error('Invalid screenshot export dimensions.');
    const [, assets] = await Promise.all([
      measure('fonts', () => loadElementFonts(state.shapes, projectFontSource)),
      measure('images', loader.assets),
    ]);
    return await encodeStillImage(state, assets, {
      outputSize: request.outputSize,
      onTiming: options.onTiming,
      ...(request.includePreview
        ? {
            onRendered: async (canvas: OffscreenCanvas) => {
              // A thumbnail error must not turn a completed image into a failed copy.
              try {
                options.onPreview?.(await screenshotExportPreview(canvas));
              } catch (reason) {
                console.warn('Screenshot export preview unavailable.', reason);
              }
            },
          }
        : {}),
    });
  } catch (reason) {
    if (reason instanceof StillEncodingError) {
      if (reason.code === 'render-unavailable') throw new Error('Screenshot rendering is unavailable.');
      if (reason.code === 'encoding-unavailable')
        throw new Error(`${state.format.toUpperCase()} encoding is unavailable.`);
    }
    throw reason;
  } finally {
    await measure('cleanup', loader.dispose);
    for (const image of images) image?.close();
  }
}

export async function runScreenshotExport(
  request: ScreenshotExportRequest,
  post: (reply: ScreenshotExportReply, transfer: Transferable[]) => void,
) {
  const timings: Record<string, number> = {};
  const started = performance.now();
  let preview: string | undefined;
  const options = {
    onTiming: (stage: string, ms: number) => {
      timings[stage] = ms;
    },
    onPreview: (src: string) => {
      preview = src;
    },
  };
  try {
    const bytes = await renderScreenshotExport(request, options);
    timings.total = performance.now() - started;
    post({ bytes, preview, timings }, [bytes]);
  } catch (reason) {
    timings.total = performance.now() - started;
    post({ error: reason instanceof Error ? reason.message : String(reason), preview, timings }, []);
  }
}
