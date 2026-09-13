import type { MediaRect } from '../composition/appearance/appearance-types';
import type { NormalizedTransform, NormalizedCrop } from '~/media/shared/composition-types';
import type { ResizeCorner } from '~/ui/ResizeHandle/types';
import type { ScreenshotCursorAsset, ScreenshotImageAsset } from './screenshot-layer-types';

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
export interface ScreenshotEncodeOptions {
  onRendered?: (canvas: OffscreenCanvas) => Promise<void>;
}
export interface ScreenshotDrag {
  x: number;
  y: number;
  width: number;
  height: number;
  initial: NormalizedTransform;
  imageFrame?: NormalizedTransform;
  corner?: ResizeCorner;
}

export type ScreenshotPanel = 'canvas' | 'image' | 'shapes' | 'cursor' | 'settings';

export interface ScreenshotDimensions {
  width: number;
  height: number;
}

export interface ScreenshotCropDrag {
  x: number;
  y: number;
  initial: NormalizedCrop;
  corner?: ResizeCorner;
}

export interface ScreenshotHistoryOptions {
  disabled: () => boolean;
  restore: () => void;
}

export interface ScreenshotImageFraming {
  rect: MediaRect;
  sourceRect: MediaRect;
  sourceSize?: { width: number; height: number };
}
