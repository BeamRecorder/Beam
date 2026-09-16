import type { BlurClip, ShapeClip } from '~/media/shared/composition-types';
import type { LayerBlendMode } from '~/media/shared/layer-compositing-types';
import type { ScreenshotCursorLayer, ScreenshotImageLayer } from './screenshot-layer-types';

export type ScreenshotClipboardLayer =
  | { type: 'shape'; value: ShapeClip }
  | { type: 'effect'; value: BlurClip }
  | { type: 'cursor'; value: ScreenshotCursorLayer }
  | { type: 'image'; value: ScreenshotImageLayer };

export interface ScreenshotClipboardEntry {
  layer: ScreenshotClipboardLayer;
  name: string;
  opacity: number;
  blendMode: LayerBlendMode;
}

export interface ScreenshotLayerClipboard {
  entries: ScreenshotClipboardEntry[];
  primaryIndex: number;
}

export interface ScreenshotPasteResult {
  ids: string[];
  primaryId: string;
  names: string[];
}
