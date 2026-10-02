import type { ExportRequest } from './export-types';
import { openExportAssets } from './mediabunny/export-worker-assets';
import { loadExportImages } from './mediabunny/export-images';
import { loadExportFonts } from './mediabunny/export-worker-fonts';
import { renderExportVideo } from './mediabunny/export-worker-pipelines';
import { createHttpFrameSource } from '@beam/runtime/frames/http-frame-source';

/** A still capture consumes the exact composition pipeline used for offline video frames. */
export async function captureCompositionFrame(
  request: ExportRequest,
  timeMs: number,
  cursorImages: ReadonlyMap<string, ImageBitmap>,
  signal: AbortSignal,
) {
  if (!Number.isFinite(timeMs) || timeMs < 0 || timeMs >= request.snapshot.duration * 1000)
    throw new RangeError('Frame time must be inside the composition.');
  signal.throwIfAborted();
  const frame = Math.floor((timeMs * request.snapshot.render.fps) / 1000);
  const assets = await openExportAssets({ ...request, includeAudio: false }, signal, () => {});
  const owned = new Map<string, ImageBitmap>();
  try {
    await loadExportFonts(request.snapshot.composition, request.snapshot.fontSources);
    const images = await loadExportImages(request, owned);
    const canvas = new OffscreenCanvas(request.snapshot.canvas.width, request.snapshot.canvas.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Frame capture requires a canvas backend.');
    let bytes: ArrayBuffer | undefined;
    await renderExportVideo(
      request,
      assets,
      images,
      cursorImages,
      context,
      {
        async addVideo() {
          bytes = await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer();
        },
        closeVideo() {
          /* Still capture has no encoder track to finalize. */
        },
      },
      signal,
      () => {},
      new Map((request.frameSources ?? []).map((source) => [source.assetId, createHttpFrameSource(source.url)])),
      { first: frame, end: frame + 1 },
    );
    if (!bytes) throw new Error('Composition produced no frame.');
    return { bytes, timeMs: (frame * 1000) / request.snapshot.render.fps };
  } finally {
    assets.dispose();
    for (const bitmap of owned.values()) bitmap.close();
  }
}
