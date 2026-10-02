import type { BlurClip, ShapeClip, VisualClip } from '../shared/composition-types';
import type { OutputCanvasSettings } from '../layout/output-canvas';
import type { BackgroundValue } from '../shared/background-types';
import type { LayerCompositing } from '../shared/layer-compositing-types';
import type { CursorSelection } from '../capture/cursor-pack';
import type { CursorShadowDirection as ShadowDirection } from '../capture/cursor-presentation';

export interface ScreenshotState {
  canvas: OutputCanvasSettings;
  background: BackgroundValue | null;
  blurPercent: number;
  image: VisualClip;
  shapes: ShapeClip[];
  effects?: BlurClip[];
  cursors?: ScreenshotCursorLayer[];
  images?: ScreenshotImageLayer[];
  composition?: LayerCompositing[];
  format: 'png' | 'webp';
  quality: number;
}

export interface ScreenshotImageLayer extends VisualClip {
  kind: 'image';
  source: string;
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

export interface ScreenshotDimensions {
  width: number;
  height: number;
}
export type ResizeCorner =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left';
