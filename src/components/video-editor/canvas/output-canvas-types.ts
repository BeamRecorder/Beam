import type { CanvasTransitions } from '~/media/shared/composition-types';

export type OutputCanvasPreset = '16:9' | '9:16' | '1:1' | '4:5' | '3:4' | '4:3' | '21:9' | 'custom';
export type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface WatermarkSettings {
  enabled: boolean;
  text: 'none' | 'made-with-beam' | 'beam';
  showLogo: boolean;
  localized: boolean;
  renderedText?: string;
  position: WatermarkPosition;
  size: number;
  shadow: number;
  backgroundColor: string;
  backgroundOpacity: number;
  backgroundRadius: number;
  backgroundPadding: number;
}

export interface OutputCanvasSettings {
  preset: OutputCanvasPreset;
  width: number;
  height: number;
  showBackground: boolean;
  /** Missing only on legacy project data before normalization. */
  transitions?: CanvasTransitions;
  watermark?: WatermarkSettings;
}
