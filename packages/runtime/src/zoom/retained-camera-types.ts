import type { ClipComposition } from '@beam/engine/shared/composition-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import type { CameraCheckpointReuse, CompositionCameraEvaluator } from '@beam/engine/zoom/composition-camera-types';

export interface RetainedCameraRequest {
  composition: ClipComposition;
  zooms: readonly ZoomElement[];
  /** Same immutable source telemetry allows live springs to survive edits/settings changes. */
  liveKey?: object;
  stableInputs: readonly unknown[];
  create(reuse?: CameraCheckpointReuse): CompositionCameraEvaluator;
}
