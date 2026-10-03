export type ZoomTiltDirectionPreset =
  | 'tilt-back'
  | 'tilt-front'
  | 'tilt-left'
  | 'tilt-right'
  | 'pull-back'
  | 'pull-front';

export interface ZoomTiltPreviewControls {
  intensity: number;
  horizontal: number;
  vertical: number;
}

export interface ZoomTiltPresetDefinition extends ZoomTiltPreviewControls {
  id: ZoomTiltDirectionPreset;
  labelKey: string;
}
