import type { RecordlyZoomSettings } from '@beam/engine/zoom/recordly-settings-types';
export type RecordlyNumericKey = {
  [K in keyof RecordlyZoomSettings]: RecordlyZoomSettings[K] extends number ? K : never;
}[keyof RecordlyZoomSettings];
export interface RecordlyNumericControl {
  key: RecordlyNumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

export interface RecordlyBlurControl {
  key: keyof RecordlyZoomSettings['zoomMotionBlurTuning'];
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}
