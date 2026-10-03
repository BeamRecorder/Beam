import { encodeStillImage } from '@beam/encoder/still-encoder';
import { StillEncodingError } from '@beam/encoder/still-encoding-error';
import { validScreenshotDimensions } from '@beam/engine/screenshot/screenshot-dimensions';
import { projectFontSource } from '~/api/project-font-source';
import { loadElementFonts } from '@beam/runtime/shared/element-font-loader';
import type { ScreenshotExportReply, ScreenshotExportRequest } from './screenshot-export-types';
import { createScreenshotExportImages } from './screenshot-export-images';

export async function renderScreenshotExport(request: ScreenshotExportRequest): Promise<ArrayBuffer> {
  const { state, decorations } = request;
  const loader = createScreenshotExportImages(request);
  const images = new Set([decorations.logo, ...[...(decorations.cursors?.values() ?? [])].map(({ image }) => image)]);
  try {
    if (!validScreenshotDimensions(state.canvas)) throw new Error('Invalid screenshot export dimensions.');
    await loadElementFonts(state.shapes, projectFontSource);
    const assets = await loader.assets();
    return await encodeStillImage(state, assets);
  } catch (reason) {
    if (reason instanceof StillEncodingError) {
      if (reason.code === 'render-unavailable') throw new Error('Screenshot rendering is unavailable.');
      if (reason.code === 'encoding-unavailable')
        throw new Error(`${state.format.toUpperCase()} encoding is unavailable.`);
    }
    throw reason;
  } finally {
    await loader.dispose();
    for (const image of images) image?.close();
  }
}

export async function runScreenshotExport(
  request: ScreenshotExportRequest,
  post: (reply: ScreenshotExportReply, transfer: Transferable[]) => void,
) {
  try {
    const bytes = await renderScreenshotExport(request);
    post({ bytes }, [bytes]);
  } catch (reason) {
    post({ error: reason instanceof Error ? reason.message : String(reason) }, []);
  }
}
