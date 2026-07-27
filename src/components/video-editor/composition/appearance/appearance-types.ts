import type { ClipAppearance } from "../composition-types";

export interface MediaRect { x: number; y: number; width: number; height: number }
export interface DecoratedMediaOptions {
  source: CanvasImageSource;
  sourceRect?: MediaRect;
  rect: MediaRect;
  appearance?: ClipAppearance;
  title: string;
  mirrored?: boolean;
}
