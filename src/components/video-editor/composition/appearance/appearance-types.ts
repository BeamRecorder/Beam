import type { ClipAppearance } from '~/media/shared/composition-types';

export interface MediaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface DecoratedMediaOptions {
  source: CanvasImageSource;
  sourceRect?: MediaRect;
  rect: MediaRect;
  appearance?: ClipAppearance;
  /** Shadow values are stored in output pixels; preview callers provide their display scale. */
  shadowScale?: number;
  title: string;
  mirrored?: boolean;
  mirroredY?: boolean;
  mask?: 'circle' | 'squircle';
}
