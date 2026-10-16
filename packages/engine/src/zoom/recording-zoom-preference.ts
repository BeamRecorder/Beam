import type { RecordingZoomMode } from './recording-zoom-types';
import type { ZoomElement } from './zoom-types';
import { normalizeOrbitSettings } from './orbit-settings';

export function recordingZoomMode(value: unknown): RecordingZoomMode {
  return value === 'off' || value === '3d' || value === 'orbit' || value === 'glass' ? value : '2d';
}

export function applyRecordingZoomMode(zoom: ZoomElement, mode: Exclude<RecordingZoomMode, 'glass'>): ZoomElement {
  const spatial = mode === '3d' || mode === 'orbit';
  return {
    ...zoom,
    enabled: mode !== 'off',
    projection: spatial ? 'orbit' : '2d',
    ...(spatial
      ? {
          orbitSettings: normalizeOrbitSettings(zoom.orbitSettings),
          tiltIntensity: 1,
          transition: 'cinematic' as const,
        }
      : {}),
  };
}
