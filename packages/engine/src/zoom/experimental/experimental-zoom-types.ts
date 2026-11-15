import type { CursorTelemetryPoint } from '../../capture/capture-session';
import type { ZoomFocus } from '../zoom-types';

export interface ExperimentalPoint extends CursorTelemetryPoint {
  mouseButton?: number;
}
export interface ExperimentalClip {
  startMs: number;
  endMs: number;
  sourceStartMs: number;
  speed: number;
}
export interface ExperimentalSpan {
  start: number;
  end: number;
}
export interface ExperimentalSuggestion extends ExperimentalSpan {
  focus: ZoomFocus;
}
export interface ExperimentalGenerationInputs {
  telemetry: readonly ExperimentalPoint[];
  durationMs: number;
  clips?: readonly ExperimentalClip[];
  reserved?: readonly ExperimentalSpan[];
  duration?: number;
  spacingMs?: number;
  mergeGapMs?: number;
  paddingMs?: number;
}
