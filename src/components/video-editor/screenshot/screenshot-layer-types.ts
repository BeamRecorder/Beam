import type { CursorSelection, CursorAssetDescriptor } from '~/api/types/cursor-pack';
import type { LayerCompositing } from '~/media/shared/layer-compositing-types';
import type { ShadowDirection } from '../properties/cursor/shadow-types';
import type { VisualClip } from '~/media/shared/composition-types';

export interface ScreenshotImageLayer extends VisualClip {
  kind: 'image';
  source: string;
  width: number;
  height: number;
}
export interface ScreenshotImageAsset {
  rasterSize?: { width: number; height: number };
  image: CanvasImageSource;
  width: number;
  height: number;
}

export interface ScreenshotCursorLayer {
  id: string;
  name: string;
  enabled: boolean;
  position: { x: number; y: number };
  size: number;
  rotation: number;
  selection: CursorSelection & { mode: 'fixed'; cursorId: string };
  color: string;
  shadowEnabled: boolean;
  shadowBlur: number;
  shadowColor: string;
  shadowDirection: ShadowDirection;
}
export interface ScreenshotCursorAsset {
  image: CanvasImageSource;
  asset: CursorAssetDescriptor;
}
export interface ScreenshotLayer extends LayerCompositing {
  kind: 'background' | 'image' | 'shape' | 'arrow' | 'text' | 'drawing' | 'cursor' | 'watermark' | 'effect';
  name: string;
  visible: boolean;
}
export interface ScreenshotCursorUpdate {
  selection?: CursorSelection;
  size?: number;
  color?: string;
  shadowEnabled?: boolean;
  shadowBlur?: number;
  shadowColor?: string;
  shadowDirection?: ShadowDirection;
  rotation?: number;
}
