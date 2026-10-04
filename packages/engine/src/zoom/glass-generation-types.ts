import type { CursorTelemetryPoint } from '../capture/capture-session';
import type { ZoomElement, ZoomStyle } from './zoom-types';
export interface ZoomGenerationOptions {
  style: ZoomStyle;
  canvas: { width: number; height: number; showBackground: boolean };
}
export interface GlassGenerationInputs {
  telemetry: CursorTelemetryPoint[];
  sessionId: string;
  durationMs: number;
  width: number;
  height: number;
  reserved: ZoomElement[];
}
