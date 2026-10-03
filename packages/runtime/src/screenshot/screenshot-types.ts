import type { ScreenshotLayer } from '@beam/engine/screenshot/screenshot-types';
import type { CursorAssetDescriptor } from '@beam/engine/capture/cursor-pack';
import type { MediaRect } from '../composition/appearance/appearance-types';

export interface ScreenshotImageAsset {
  rasterSize?: { width: number; height: number };
  image: CanvasImageSource;
  width: number;
  height: number;
}
export interface ScreenshotCursorAsset {
  image: CanvasImageSource;
  asset: CursorAssetDescriptor;
}
export interface ScreenshotRenderAssets {
  rasterSize?: { width: number; height: number };
  image: CanvasImageSource;
  background: CanvasImageSource | null;
  logo: CanvasImageSource | null;
  width: number;
  height: number;
  cursors?: Map<string, ScreenshotCursorAsset>;
  images?: Map<string, ScreenshotImageAsset>;
}
export interface ScreenshotImageFraming {
  rect: MediaRect;
  sourceRect: MediaRect;
  sourceSize?: { width: number; height: number };
}
export type ScreenshotLayerPaintObserver = (layer: ScreenshotLayer, durationMs: number) => void;
