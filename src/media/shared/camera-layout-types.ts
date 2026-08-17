export type CameraLayoutPreset =
  | 'custom'
  | 'floating-top-left'
  | 'floating-top-right'
  | 'floating-bottom-left'
  | 'floating-bottom-right'
  | 'floating-center'
  | 'fullscreen'
  | 'split-left'
  | 'split-right'
  | 'split-top'
  | 'split-bottom';

export type CameraFramingPreset =
  'custom' | 'fill' | 'fit' | 'square' | 'portrait' | 'landscape' | 'squircle' | 'circle';

export const CAMERA_LAYOUT_PRESETS: readonly CameraLayoutPreset[] = [
  'custom',
  'floating-top-left',
  'floating-top-right',
  'floating-bottom-left',
  'floating-bottom-right',
  'floating-center',
  'fullscreen',
  'split-left',
  'split-right',
  'split-top',
  'split-bottom',
];

export const CAMERA_FRAMING_PRESETS: readonly CameraFramingPreset[] = [
  'custom',
  'fill',
  'fit',
  'square',
  'portrait',
  'landscape',
  'squircle',
  'circle',
];

export const isCameraLayoutPreset = (value: unknown): value is CameraLayoutPreset =>
  typeof value === 'string' && CAMERA_LAYOUT_PRESETS.includes(value as CameraLayoutPreset);

export const isCameraFramingPreset = (value: unknown): value is CameraFramingPreset =>
  typeof value === 'string' && CAMERA_FRAMING_PRESETS.includes(value as CameraFramingPreset);

export const isSplitCameraLayout = (value: CameraLayoutPreset) => value.startsWith('split-');
