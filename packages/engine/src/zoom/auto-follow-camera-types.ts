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
}
