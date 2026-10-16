export interface OrbitCameraPose {
  azimuth: number;
  elevation: number;
  distance: number;
  /** Authored magnification, separate from the perspective/framing correction. */
  zoomScale?: number;
  /** Lens distance at 1x, so containment stays stable while dollying. */
  framingDistance?: number;
  /** Angular envelope, used to keep framing constant while the pointer moves. */
  strength: number;
  roll?: number;
  maxAzimuth?: number;
  maxElevation?: number;
  pullback?: number;
}

export interface OrbitCameraSettings {
  yaw: number;
  pitch: number;
  roll: number;
  horizontal: number;
  vertical: number;
  fieldOfView: number;
  dolly: number;
  responseMs: number;
  leadMs: number;
  pullback: number;
}
export interface OrbitPresetDefinition {
  id: 'subtle' | 'balanced' | 'dynamic' | 'isometric' | 'left' | 'right' | 'pullback' | 'pullback-large';
  labelKey: string;
  settings: OrbitCameraSettings;
}
