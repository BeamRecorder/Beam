import type { ZoomAutoFollowSettings, ZoomFocus } from './zoom-types';

export interface AutoFollowState {
  settings: ZoomAutoFollowSettings;
  initialized: boolean;
  reachedFullZoom: boolean;
  lastTimeMs: number;
  lockUntilMs: number;
  target: ZoomFocus;
  frozenTarget: ZoomFocus;
  direction: ZoomFocus;
  anchorCursor: ZoomFocus;
  anchorFocus: ZoomFocus;
  previousCursor: ZoomFocus | null;
  lastMotionTimeMs: number;
  settled: boolean;
}
