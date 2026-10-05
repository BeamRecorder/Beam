import type { AnimatedFrameSettings } from '@beam/engine/shared/animated-frame-types';
import type { MediaRect } from './appearance-types';

export interface AnimatedFrameRenderOptions {
  rect: MediaRect;
  radius: number;
  mask?: 'circle' | 'squircle';
  settings: Readonly<AnimatedFrameSettings>;
  timeMs: number;
  appearanceScale: number;
  pixelScale: number;
}

export interface AnimatedFrameSurface {
  canvas: OffscreenCanvas;
  padding: number;
}
