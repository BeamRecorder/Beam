import type { RecordingZoomMode } from './recording-zoom-types';
import type { ZoomElement } from './zoom-types';

export function recordingZoomMode(value: unknown): RecordingZoomMode {
  return value === 'off' || value === '3d' ? value : '2d';
}

export function applyRecordingZoomMode(zoom: ZoomElement, mode: RecordingZoomMode): ZoomElement {
  return { ...zoom, enabled: mode !== 'off', projection: mode === '3d' ? '3d' : '2d' };
}
