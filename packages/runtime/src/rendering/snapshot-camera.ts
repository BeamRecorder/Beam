import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import {
  createCompositionCameraEvaluator,
  type CompositionCameraEvaluator,
} from '@beam/engine/zoom/composition-camera';
import { createCompositionScreenResolver } from '@beam/engine/composition/scene-layers';
import { mapSourcePointToScreen, resolveScreenRenderGeometry } from '@beam/engine/composition/camera-layout';
import { sessionTimeAt } from '@beam/engine/shared/timeline-mapping';
import { createScenePointMapper } from '@beam/engine/scene/scene-spatial';

export const createSnapshotCameraEvaluator = (
  snapshot: CompositionSnapshot,
  sourceWidth: number,
  sourceHeight: number,
): CompositionCameraEvaluator => {
  const screenAt = createCompositionScreenResolver(snapshot.composition);
  const scenePoint = createScenePointMapper(snapshot.composition, snapshot.canvas.width, snapshot.canvas.height);
  return createCompositionCameraEvaluator({
    zooms: snapshot.zooms,
    telemetry: snapshot.cursor.telemetry,
    autoFollow: snapshot.zoomAutoFollow,
    mapTelemetryTime: (timeMs) => {
      const screen = screenAt(timeMs);
      return screen ? (sessionTimeAt(screen, timeMs, snapshot.composition) ?? timeMs) : timeMs;
    },
    mapFocus: (focus, zoom, timeMs) => {
      const screen = screenAt(timeMs);
      if (zoom.mode !== 'auto' || !screen) return focus;
      const geometry = resolveScreenRenderGeometry(
        screen,
        sourceWidth,
        sourceHeight,
        snapshot.canvas.width,
        snapshot.canvas.height,
        snapshot.canvas.showBackground,
      );
      const mapped = mapSourcePointToScreen(
        focus,
        sourceWidth,
        sourceHeight,
        snapshot.canvas.width,
        snapshot.canvas.height,
        geometry,
      );
      return scenePoint(screen.id, mapped, timeMs);
    },
  });
};
