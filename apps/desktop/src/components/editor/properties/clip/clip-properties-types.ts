import type {
  ClipFrame,
  ClipFrameTheme,
  ClipShadowMode,
  ClipShadowSize,
  NormalizedCrop,
  NormalizedTransform,
} from '@beam/engine/shared/composition-types';
import type { CameraFramingPreset, CameraLayoutPreset } from '@beam/engine/shared/camera-layout-types';
import type { AnimatedFrameSettings } from '@beam/engine/shared/animated-frame-types';
import type { PhoneFrameFill } from '@beam/engine/shared/color-fill-types';
export interface ClipPropertiesEmits {
  (e: 'update:crop', crop: NormalizedCrop): void;
  (e: 'preview:crop', crop: NormalizedCrop | null): void;
  (e: 'update:playbackRate', rate: number): void;
  (e: 'update:isMirrored', isMirrored: boolean): void;
  (e: 'update:isMirroredY', isMirroredY: boolean): void;
  (e: 'update:rotation', degrees: number): void;
  (e: 'update:cornerRadius', radius: string): void;
  (e: 'corner-radius-interaction', interacting: boolean): void;
  (
    e: 'update:shadow',
    shadow: {
      size: ClipShadowSize;
      blur?: number;
      mode?: ClipShadowMode;
      color?: string;
      direction?: string;
    },
  ): void;
  (
    e: 'update:appearance',
    appearance: {
      borderEnabled?: boolean;
      borderColor?: string;
      borderWidth?: number;
      frame?: ClipFrame;
      frameTitle?: string;
      frameColor?: string;
      frameTheme?: ClipFrameTheme;
      frameShowMenu?: boolean;
      frameShowScrollbars?: boolean;
      frameChromeScale?: number;
      phoneFrameFill?: PhoneFrameFill;
      animatedFrame?: AnimatedFrameSettings;
    },
  ): void;
  (e: 'update:clipTransform', transform: NormalizedTransform): void;
  (e: 'update:cameraLayout', preset: Exclude<CameraLayoutPreset, 'custom'>): void;
  (e: 'update:cameraFraming', preset: Exclude<CameraFramingPreset, 'custom'>): void;
  (e: 'update:cameraSplitRatio', ratio: number): void;
  (e: 'update:cameraSplitPadding', padding: number): void;
  (e: 'update:reactToZoom', enabled: boolean): void;
  (e: 'reset:clipTransform'): void;
  (e: 'delete'): void;
  (e: 'split'): void;
}

export interface ClipAppearanceEmits {
  (e: 'update:isMirrored', isMirrored: boolean): void;
  (e: 'update:isMirroredY', isMirroredY: boolean): void;
  (e: 'update:rotation', degrees: number): void;
  (e: 'update:cornerRadius', radius: string): void;
  (e: 'corner-radius-interaction', interacting: boolean): void;
  (
    e: 'update:shadow',
    shadow: {
      size: ClipShadowSize;
      blur?: number;
      mode?: ClipShadowMode;
      color?: string;
      direction?: string;
    },
  ): void;
  (
    e: 'update:appearance',
    appearance: {
      borderEnabled?: boolean;
      borderColor?: string;
      borderWidth?: number;
      frame?: ClipFrame;
      frameTitle?: string;
      frameColor?: string;
      frameTheme?: ClipFrameTheme;
      frameShowMenu?: boolean;
      frameShowScrollbars?: boolean;
      frameChromeScale?: number;
      phoneFrameFill?: PhoneFrameFill;
      animatedFrame?: AnimatedFrameSettings;
    },
  ): void;
}
