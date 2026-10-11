import type { OutputCanvasSettings } from '@beam/engine/layout/output-canvas-types';
import type { BackgroundValue } from '@beam/engine/shared/background-types';
import type { VisualClip } from '@beam/engine/shared/composition-types';
import type { VisualMediaSource } from '../composition/appearance/appearance-types';

export interface PresetPreviewScene {
  canvas: OutputCanvasSettings;
  background: BackgroundValue | null;
  blurPercent: number;
  visual: VisualClip;
}

export interface PresetPreviewAssets {
  image: VisualMediaSource;
  background: CanvasImageSource | null;
  logo: CanvasImageSource | null;
}
