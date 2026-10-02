export interface ScreenRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenRegionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenRegionOverlayOptions {
  bounds: ScreenRegionBounds;
  region?: ScreenRegion | null;
  context?: 'default' | 'quick-snip';
  captureMode?: 'studio' | 'instant' | 'screenshot';
  recording?: RegionRecordingSettings;
  preview?: string;
  previewError?: string;
  pixelSize?: { width: number; height: number };
}

export interface ScreenRegionSelectionOptions {
  bounds?: ScreenRegionBounds;
  region?: ScreenRegion | null;
  captureMode?: 'studio' | 'instant' | 'screenshot';
  recording?: RegionRecordingSettings;
}

export interface ScreenRegionSelectionResult {
  bounds: ScreenRegionBounds;
  region: ScreenRegion;
  recording?: RegionRecordingSettings;
}

export interface RegionRecordingSettings {
  cameraId: string;
  microphoneId: string;
  systemAudio: boolean;
  countdownSeconds: number;
  hideTaskbar: boolean;
  hideDesktopIcons: boolean;
  showRealCursor: boolean;
}
