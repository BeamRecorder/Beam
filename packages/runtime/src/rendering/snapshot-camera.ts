import { createRecordlySourceClock } from '@beam/engine/zoom/experimental/recordly-source-clock';
import { recordlyCompositionClips } from '@beam/engine/zoom/experimental/recordly-inputs';
import { experimentalScreenGeometry } from '@beam/engine/zoom/experimental/experimental-camera-geometry';
import { FULL_EXPERIMENTAL_GEOMETRY } from '@beam/engine/zoom/experimental/experimental-camera-geometry';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import {
  createCompositionCameraEvaluator,
  type CompositionCameraEvaluator,
} from '@beam/engine/zoom/composition-camera';
import { createCompositionScreenResolver } from '@beam/engine/composition/scene-layers';
import { mapSourcePointToScreen, resolveScreenRenderGeometry } from '@beam/engine/composition/camera-layout';
import { sessionTimeAt } from '@beam/engine/shared/timeline-mapping';
import { createScenePointMapper } from '@beam/engine/scene/scene-spatial';
import type { CameraCheckpointReuse } from '@beam/engine/zoom/composition-camera-types';
import { compileSceneComposition } from '@beam/engine/scene/scene-clock';

export const createSnapshotCameraEvaluator = (
  snapshot: CompositionSnapshot,
  sourceWidth: number,
  sourceHeight: number,
  reuse?: CameraCheckpointReuse,
): CompositionCameraEvaluator => {
  const screenAt = createCompositionScreenResolver(snapshot.composition);
  // An overlapping screen can become foremost before the current clip ends.
  // Bound lookahead at every potential cut, including short inserted clips.
  const screenBoundaries = compileSceneComposition(snapshot.composition)
    .clips.filter((clip) => clip.kind === 'screen')
    .flatMap((clip) => [clip.timelineStartMs, clip.timelineStartMs + clip.timelineDurationMs])
    .sort((left, right) => left - right);
  const scenePoint = createScenePointMapper(snapshot.composition, snapshot.canvas.width, snapshot.canvas.height);
  return createCompositionCameraEvaluator(
    {
      frameRate: snapshot.render.fps,
      viewport: { width: snapshot.canvas.width, height: snapshot.canvas.height },
      recordlyClips: recordlyCompositionClips(compileSceneComposition(snapshot.composition)),
      recordlySourceAt: createRecordlySourceClock(snapshot.composition, screenAt),
      sourceDurationMs: Math.max(
        0,
        ...snapshot.composition.assets
          .filter((asset) => asset.kind === 'video')
          .map((asset) => (asset.sessionStartMs ?? 0) + asset.durationMs),
      ),
      experimentalGeometryAt: (timeMs) => {
        const screen = screenAt(timeMs);
        const asset = snapshot.composition.assets.find((asset) => asset.id === screen?.assetId);
        return screen
          ? experimentalScreenGeometry(
              screen,
              asset?.width ?? sourceWidth,
              asset?.height ?? sourceHeight,
              snapshot.canvas.width,
              snapshot.canvas.height,
              snapshot.canvas.showBackground,
            )
          : FULL_EXPERIMENTAL_GEOMETRY;
      },
      zooms: snapshot.zooms,
      telemetry: snapshot.cursor.telemetry,
      autoFollow: snapshot.zoomAutoFollow,
      followEndMsAt: (timeMs) => {
        const screen = screenAt(timeMs);
        if (!screen) return timeMs;
        let low = 0,
          high = screenBoundaries.length;
        while (low < high) {
          const middle = (low + high) >>> 1;
          if (screenBoundaries[middle]! <= timeMs) low = middle + 1;
          else high = middle;
        }
        return Math.min(screen.timelineStartMs + screen.timelineDurationMs, screenBoundaries[low] ?? Infinity);
      },
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
    },
    reuse,
  );
};
