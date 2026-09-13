import type { ScreenshotState } from '~/api/types/screenshot';
import type { CursorAssetDescriptor, CursorPackDescriptor } from '~/api/types/cursor-pack';
import type { ScreenshotLayer } from '../../screenshot-layer-types';

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
