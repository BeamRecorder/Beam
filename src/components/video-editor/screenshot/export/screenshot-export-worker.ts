import { drawScreenshot } from '../screenshot-draw';
import { validScreenshotDimensions } from '../screenshot-dimensions';
import { releaseCompositedLayerSurface } from '../../composition/render-composited-layer';
import { loadElementFonts } from '~/media/shared/element-fonts';
import type { ScreenshotExportReply, ScreenshotExportRequest } from './screenshot-export-types';
import { createScreenshotExportImages } from './screenshot-export-images';

export async function renderScreenshotExport(request: ScreenshotExportRequest): Promise<ArrayBuffer> {
  const { state, decorations } = request;
  const loader = createScreenshotExportImages(request);
  const images = new Set([decorations.logo, ...[...(decorations.cursors?.values() ?? [])].map(({ image }) => image)]);
  let canvas: OffscreenCanvas | undefined;
  let ctx: OffscreenCanvasRenderingContext2D | null = null;
  try {
    if (!validScreenshotDimensions(state.canvas)) throw new Error('Invalid screenshot export dimensions.');
    await loadElementFonts(state.shapes);
    const assets = await loader.assets();
    canvas = new OffscreenCanvas(state.canvas.width, state.canvas.height);
    ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Screenshot rendering is unavailable.');
    drawScreenshot(ctx, state, assets, canvas.width, canvas.height);
    const type = `image/${state.format}`;
    const blob = await canvas.convertToBlob({ type, quality: Math.max(0, Math.min(1, state.quality)) });
    if (blob.type !== type) throw new Error(`${state.format.toUpperCase()} encoding is unavailable.`);
    return await blob.arrayBuffer();
  } finally {
    if (ctx) releaseCompositedLayerSurface(ctx);
    if (canvas) canvas.width = canvas.height = 0;
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
