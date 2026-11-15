import { createRecordlySourceClock } from '@beam/engine/zoom/experimental/recordly-source-clock';
import { recordlyCompositionClips } from '@beam/engine/zoom/experimental/recordly-inputs';
import { createCompositionCameraEvaluator } from '@beam/engine/zoom/composition-camera';
import type { CameraCheckpointReuse } from '@beam/engine/zoom/composition-camera-types';
import { recordingFrameRate } from '@beam/engine/capture/recording-frame-rate';
import { experimentalScreenGeometry } from '@beam/engine/zoom/experimental/experimental-camera-geometry';
import { FULL_EXPERIMENTAL_GEOMETRY } from '@beam/engine/zoom/experimental/experimental-camera-geometry';
import { sessionTimeAt } from '@beam/engine/shared/timeline-mapping';
import { mapSourcePointToScreen, resolveScreenRenderGeometry } from '@beam/engine/composition/camera-layout';
import { isPhoneFrame } from '@beam/engine/shared/phone-frame-types';
import { frameMediaRect } from '@beam/engine/shared/frame-layout';
import type { PreviewCameraInputs } from './preview-camera-types';

export function createPreviewCamera(inputs: PreviewCameraInputs, reuse?: CameraCheckpointReuse) {
  const { options, selectedZoom, zooms, telemetry, composition, output, videoWidth, videoHeight, dw, dh, screenAt } =
    inputs;
  const previewZooms =
    !options.zoomAutoFollow?.()?.experimentalZoom &&
    !options.isPlaying() &&
    selectedZoom?.mode === 'manual' &&
    selectedZoom.effect !== 'glass'
      ? zooms.filter((zoom) => zoom.id !== selectedZoom.id)
      : zooms;
  return createCompositionCameraEvaluator(
    {
      frameRate: recordingFrameRate(options.editorData()?.tracks),
      viewport: { width: dw, height: dh },
      recordlyClips: recordlyCompositionClips(composition),
      recordlySourceAt: createRecordlySourceClock(composition, screenAt),
      sourceDurationMs: Math.max(
        0,
        ...composition.assets
          .filter((asset) => asset.kind === 'video')
          .map((asset) => (asset.sessionStartMs ?? 0) + asset.durationMs),
      ),
      experimentalGeometryAt: (timeMs) => {
        const activeScreen = screenAt(timeMs);
        const asset = composition.assets.find((asset) => asset.id === activeScreen?.assetId);
        return activeScreen
          ? experimentalScreenGeometry(
              activeScreen,
              asset?.width ?? videoWidth,
              asset?.height ?? videoHeight,
              dw,
              dh,
              output.showBackground,
            )
          : FULL_EXPERIMENTAL_GEOMETRY;
      },
      zooms: previewZooms,
      telemetry,
      autoFollow: options.zoomAutoFollow?.(),
      mapTelemetryTime: (timeMs) => {
        const activeScreen = screenAt(timeMs);
        return activeScreen ? (sessionTimeAt(activeScreen, timeMs, composition) ?? timeMs) : timeMs;
      },
      mapFocus: (focus, zoom, timeMs) => {
        const activeScreen = screenAt(timeMs);
        if (!activeScreen || zoom.mode !== 'auto') return focus;
        const activeGeometry = resolveScreenRenderGeometry(
          activeScreen,
          videoWidth,
          videoHeight,
          dw,
          dh,
          output.showBackground,
        );
        const positioned = isPhoneFrame(activeScreen.appearance.frame)
          ? frameMediaRect(
              activeGeometry.positioned,
              activeScreen.appearance.frame,
              activeGeometry.source.width,
              activeGeometry.source.height,
            )
          : activeGeometry.positioned;
        return mapSourcePointToScreen(focus, videoWidth, videoHeight, dw, dh, {
          ...activeGeometry,
          positioned,
        });
      },
    },
    reuse,
  );
}
