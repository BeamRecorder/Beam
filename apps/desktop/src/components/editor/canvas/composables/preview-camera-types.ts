import type { CursorTelemetryPoint } from '@beam/engine/capture/capture-session';
import type { ClipComposition, VisualClip } from '@beam/engine/shared/composition-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import type { OutputCanvasSettings } from '@beam/engine/layout/output-canvas';
import type { UseCameraZoomOptions } from './useCameraZoom.types';
export interface PreviewCameraInputs {
  options: Pick<UseCameraZoomOptions, 'isPlaying' | 'editorData' | 'zoomAutoFollow'>;
  selectedZoom: ZoomElement | null;
  zooms: ZoomElement[];
  telemetry: readonly CursorTelemetryPoint[];
  composition: ClipComposition;
  output: OutputCanvasSettings;
  videoWidth: number;
  videoHeight: number;
  dw: number;
  dh: number;
  screenAt: (timeMs: number) => VisualClip | null;
}
