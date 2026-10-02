import type { NormalizedTransform, NormalizedCrop } from '@beam/engine/shared/composition-types';
import type { ResizeCorner } from '~/ui/ResizeHandle/types';

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
  selection?: string[];
  targetId?: string;
}

export type ScreenshotPanel = 'canvas' | 'image' | 'shapes' | 'cursor' | 'settings';
export type ScreenshotSelectionMode = 'replace' | 'toggle';
export interface ScreenshotTranslation {
  x: number;
  y: number;
}

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
