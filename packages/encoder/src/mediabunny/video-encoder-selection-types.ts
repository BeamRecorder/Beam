import type { Quality, VideoCodec } from 'mediabunny';

export interface VideoEncoderSelection {
  codec: VideoCodec;
  quality: Quality;
  hardwareAcceleration: 'prefer-hardware' | 'prefer-software';
  bitrateMode: 'variable' | 'constant';
  hardwareEncoderCheck: 'passed' | 'unsupported' | 'failed';
  hardwareEncoderError: string | null;
}

export interface VideoEncoderRequirements {
  format: 'mp4' | 'webm';
  width: number;
  height: number;
  frameRate: number;
  bitrate: number;
}
