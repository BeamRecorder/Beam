import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import { PerspectiveSceneCompositor } from '@beam/runtime/zoom/perspective-scene-compositor';
import type { PerspectiveTransform } from '@beam/engine/zoom/perspective-projection';
import type { CameraPlaneView } from '@beam/engine/zoom/camera-plane-types';
import type { MediaRect } from '@beam/engine/shared/geometry-types';
import type { ZoomMotionBlurSample } from '@beam/engine/zoom/zoom-motion-blur-types';

let compositor: PerspectiveSceneCompositor | null = null;

export function renderPerspectiveLayers(options: {
  target: Canvas2DContext;
  width: number;
  height: number;
  transform: PerspectiveTransform;
  camera?: CameraPlaneView;
  sourceBounds?: MediaRect;
  drawLayers: (target: Canvas2DContext) => void;
}) {
  compositor ??= new PerspectiveSceneCompositor();
  compositor.render({
    target: options.target,
    bounds: { x: 0, y: 0, width: options.width, height: options.height },
    pixelScale: 1,
    camera: options.camera,
    sourceBounds: options.sourceBounds,
    draw: (target) => {
      options.drawLayers(target);
      return options.transform;
    },
  });
}

export function disposePerspectiveRenderer() {
  compositor?.dispose();
  compositor = null;
}

/** Camera-only shutter movement reuses the current decoded scene, including transparent shadows. */
export function renderPerspectiveSamples(options: {
  target: Canvas2DContext;
  width: number;
  height: number;
  sourceBounds: MediaRect;
  samples: readonly ZoomMotionBlurSample[];
  drawLayers(target: Canvas2DContext): void;
}) {
  compositor ??= new PerspectiveSceneCompositor();
  compositor.renderSamples({
    target: options.target,
    bounds: { x: 0, y: 0, width: options.width, height: options.height },
    pixelScale: 1,
    sourceBounds: options.sourceBounds,
    samples: options.samples.map((sample) => ({
      camera: sample.camera,
      transform: { tiltX: sample.camera.tiltX ?? 0, tiltY: sample.camera.tiltY ?? 0, orbit: sample.camera.orbit },
      weight: sample.weight,
    })),
    draw: options.drawLayers,
  });
}
