import type { ClipAppearance, MediaAsset } from '../shared/composition-types';

export interface WebcamRecordingOverlayRequest {
  screenClipId: string;
  asset: MediaAsset;
  name: string;
  appearance: ClipAppearance;
}
