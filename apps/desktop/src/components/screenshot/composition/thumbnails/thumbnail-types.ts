import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { CursorAssetDescriptor, CursorPackDescriptor } from '@beam/engine/capture/cursor-pack';
import type { ScreenshotLayer } from '@beam/engine/screenshot/screenshot-types';

export interface ThumbnailSpec {
  id: string;
  key: string;
  state: ScreenshotState;
  layer: ScreenshotLayer;
  sourceUrl?: string;
  cursorPack?: CursorPackDescriptor;
  cursorAsset?: CursorAssetDescriptor;
}
export interface ThumbnailRequest {
  id: string;
  revision: number;
  state: ScreenshotState;
  layer: ScreenshotLayer;
  sourceUrl?: string;
  cursorAsset?: CursorAssetDescriptor;
  bitmap?: ImageBitmap;
}
export type ThumbnailWorkerMessage = ThumbnailRequest | { type: 'retain'; ids: string[] };
export interface ThumbnailViewportOptions {
  /** All existing layers distinguish scrolling away from document deletion. */
  allIds: () => ReadonlySet<string>;
}
export type ThumbnailReply =
  | { id: string; revision: number; blob: Blob; error?: never }
  | { id: string; revision: number; error: string; blob?: never };
export interface LayerThumbnail {
  status: 'loading' | 'ready' | 'error';
  revision: number;
  url?: string;
  error?: string;
}
export interface PixelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ThumbnailImageAsset {
  image: ImageBitmap;
  width: number;
  height: number;
}
