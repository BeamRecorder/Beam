import { cameraEditInvalidationTime } from '@beam/engine/zoom/camera-edit-invalidation';
import type { CompositionCameraEvaluator } from '@beam/engine/zoom/composition-camera-types';
import type { RetainedCameraRequest } from './retained-camera-types';

/** Retain deterministic history across document drafts without retaining old documents. */
export function createRetainedCamera() {
  let previous: RetainedCameraRequest | null = null;
  let evaluator: CompositionCameraEvaluator | null = null;
  return {
    get(request: RetainedCameraRequest): CompositionCameraEvaluator {
      const stable =
        previous &&
        request.stableInputs.length === previous.stableInputs.length &&
        request.stableInputs.every((value, index) => Object.is(value, previous!.stableInputs[index]));
      const sameZooms =
        previous &&
        (request.zooms === previous.zooms ||
          (request.zooms.length === previous.zooms.length &&
            request.zooms.every((zoom, index) => zoom === previous!.zooms[index])));
      if (stable && request.composition === previous!.composition && sameZooms) return evaluator!;
      const reuse = stable
        ? {
            previous: evaluator!,
            unchangedBeforeMs: cameraEditInvalidationTime(
              previous!.composition,
              request.composition,
              previous!.zooms,
              request.zooms,
            ),
          }
        : undefined;
      evaluator = request.create(reuse);
      previous = request;
      return evaluator;
    },
    clear() {
      previous = null;
      evaluator = null;
    },
  };
}
