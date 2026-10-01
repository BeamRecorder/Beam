import { validScreenshotDimensions } from '../screenshot-dimensions';
import { screenshotExportAssets } from './screenshot-export-assets';
import { i18n } from '~/i18n';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { ScreenshotExportReply, ScreenshotWorkerOptions } from './screenshot-export-types';

export async function encodeScreenshot(
  source: string,
  state: ScreenshotState,
  { signal }: ScreenshotWorkerOptions = {},
): Promise<ArrayBuffer> {
  if (!validScreenshotDimensions(state.canvas)) throw new Error(i18n.global.t('ScreenshotEditor.dimensionsError'));
  signal?.throwIfAborted();
  const { decorations, transfer } = await screenshotExportAssets(state);
  let worker: Worker | undefined;
  try {
    signal?.throwIfAborted();
    worker = new Worker(new URL('./screenshot-export.worker.ts', import.meta.url), { type: 'module' });
    return await new Promise<ArrayBuffer>((resolve, reject) => {
      const abort = () => {
        cleanup();
        reject(signal!.reason);
      };
      signal?.addEventListener('abort', abort, { once: true });
      const cleanup = () => signal?.removeEventListener('abort', abort);
      worker!.onmessage = ({ data }: MessageEvent<ScreenshotExportReply>) => {
        cleanup();
        if ('error' in data) reject(new Error(data.error));
        else resolve(data.bytes);
      };
      worker!.onerror = (event) => {
        cleanup();
        reject(new Error(event.message));
      };
      worker!.onmessageerror = () => {
        cleanup();
        reject(new Error('Screenshot worker reply is unreadable.'));
      };
      try {
        // Workers resolve relative media against their own script, not the editor document.
        const absolute = (url: string) => new URL(url, document.baseURI).href;
        worker!.postMessage(
          {
            source: absolute(source),
            state: {
              ...state,
              background:
                state.background && 'path' in state.background
                  ? { ...state.background, path: absolute(state.background.path) }
                  : state.background,
              images: state.images?.map((image) => ({ ...image, source: absolute(image.source) })),
            },
            decorations,
          },
          transfer,
        );
      } catch (reason) {
        cleanup();
        reject(reason);
      }
    });
  } finally {
    worker?.terminate();
    for (const bitmap of transfer) bitmap.close();
  }
}
