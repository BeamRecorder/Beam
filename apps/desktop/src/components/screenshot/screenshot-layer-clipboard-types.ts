import type { LayerEffect } from '@beam/engine/gradient/gradient-types';
import type { BlurClip, ShapeClip } from '@beam/engine/shared/composition-types';
import type { LayerBlendMode } from '@beam/engine/shared/layer-compositing-types';
import type {
  ScreenshotCursorLayer,
  ScreenshotImageLayer,
  ScreenshotZoomLayer,
} from '@beam/engine/screenshot/screenshot-types';

export type ScreenshotClipboardLayer =
  | { type: 'shape'; value: ShapeClip }
  | { type: 'effect'; value: BlurClip }
  | { type: 'cursor'; value: ScreenshotCursorLayer }
  | { type: 'image'; value: ScreenshotImageLayer }
  | { type: 'zoom'; value: ScreenshotZoomLayer };

export interface ScreenshotClipboardEntry {
  layer: ScreenshotClipboardLayer;
  name: string;
  opacity: number;
  blendMode: LayerBlendMode;
  effects?: LayerEffect[];
  rotation3d?: import('@beam/engine/layout/layer-perspective-types').LayerRotation3d;
  groupId?: string;
}

export interface ScreenshotLayerClipboard {
  entries: ScreenshotClipboardEntry[];
  primaryIndex: number;
}

export interface ScreenshotClipboardSource {
  source: string;
  width: number;
  height: number;
}

export interface ScreenshotSpecialLayerCopies {
  capturedImage?: ScreenshotImageLayer;
  background?: ScreenshotImageLayer;
  watermark?: ScreenshotImageLayer;
}

export interface ScreenshotPasteResult {
  ids: string[];
  primaryId: string;
  names: string[];
}
