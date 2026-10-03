import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotRenderAssets } from '@beam/runtime/screenshot/screenshot-types';
import type { ScreenshotImageAsset, ScreenshotCursorAsset } from '@beam/runtime/screenshot/screenshot-types';

export type ScreenshotExportImage = Omit<ScreenshotImageAsset, 'image'> & { image: ImageBitmap };
export type ScreenshotExportCursor = Omit<ScreenshotCursorAsset, 'image'> & { image: ImageBitmap };
export interface ScreenshotExportAssets extends Omit<
  ScreenshotRenderAssets,
  'image' | 'background' | 'logo' | 'images' | 'cursors'
> {
  image: ImageBitmap;
  background: ImageBitmap | null;
  logo: ImageBitmap | null;
  images?: Map<string, ScreenshotExportImage>;
  cursors?: Map<string, ScreenshotExportCursor>;
}
export interface ScreenshotExportTransfer {
  decorations: ScreenshotExportDecorations;
  transfer: ImageBitmap[];
}
export interface ScreenshotExportDecorations {
  logo: ImageBitmap | null;
  cursors?: Map<string, ScreenshotExportCursor>;
}

export interface ScreenshotExportRequest {
  source: string;
  state: ScreenshotState;
  decorations: ScreenshotExportDecorations;
}
export type ScreenshotExportReply = { bytes: ArrayBuffer } | { error: string };
export interface ScreenshotWorkerOptions {
  signal?: AbortSignal;
}
export interface ScreenshotExporter {
  encode(source: string, state: ScreenshotState, options?: ScreenshotWorkerOptions): Promise<ArrayBuffer>;
  dispose(): void;
}
export interface ScreenshotExportCacheEntry {
  key: string;
  bytes: ArrayBuffer;
}
