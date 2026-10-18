import type { RegionRecordingSettings } from '~/api/types/screen-region';
export interface CapturePreparationRequest {
  settings: RegionRecordingSettings;
}
export type PrepareRecording = (
  request: CapturePreparationRequest,
  start: (settings: RegionRecordingSettings) => Promise<void>,
) => Promise<void>;
