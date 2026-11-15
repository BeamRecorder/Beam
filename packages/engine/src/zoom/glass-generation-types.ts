import type { RecordlyZoomSettings } from './recordly-settings-types';
import type { CursorTelemetryPoint, CursorEvent } from '../capture/capture-session';
import type { ZoomElement, ZoomStyle } from './zoom-types';
export interface ZoomGenerationCanvas {
  width: number;
  height: number;
  showBackground: boolean;
}
export interface ZoomGenerationOptions {
  experimentalZoom?: boolean;
  recordly?: RecordlyZoomSettings;
  cursorEvents?: readonly CursorEvent[];
  style: ZoomStyle;
  canvas?: ZoomGenerationCanvas;
}
export interface GlassGenerationInputs {
  telemetry: CursorTelemetryPoint[];
  sessionId: string;
  durationMs: number;
  width: number;
  height: number;
  reserved: ZoomElement[];
}
