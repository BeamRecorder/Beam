import type { ExportRequest } from '@beam/encoder';
import type { CompositionSnapshot } from '@beam/engine';
export interface MotionJob {
  version: 1;
  entry: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
  format: 'mp4' | 'webm';
  preset: 'low' | 'medium' | 'high';
  snapshot?: CompositionSnapshot;
}
export interface MotionHost {
  entry: string;
  width: number;
  height: number;
  assetId: string;
}
export interface PreparedMotion {
  request: ExportRequest;
  host: MotionHost;
}
