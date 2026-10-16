import type { CursorTelemetryPoint } from '../capture/capture-session';
import type { ZoomDepth, ZoomElement, ZoomFocus } from './zoom-types';

export interface ZoomShotBounds {
  wideUntilMs: number;
  wideFromMs: number;
  ignoreClicksFromMs?: number;
}
export interface ZoomShotOptions {
  telemetry: readonly CursorTelemetryPoint[];
  durationMs: number;
  reserved?: readonly ZoomElement[];
  bounds?: ZoomShotBounds;
}
export interface ZoomShotBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface ZoomAction {
  startMs: number;
  endMs: number;
  box: ZoomShotBox;
}
export interface ZoomShot {
  startMs: number;
  endMs: number;
  firstClickMs: number;
  focus: ZoomFocus;
  depth: ZoomDepth;
  box: ZoomShotBox;
  clicks: number;
  actions: readonly ZoomAction[];
}
