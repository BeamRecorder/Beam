import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import { PerspectiveSceneCompositor } from '@beam/runtime/zoom/perspective-scene-compositor';
import type { PerspectiveTransform } from '@beam/engine/zoom/perspective-projection';

let compositor: PerspectiveSceneCompositor | null = null;

export function renderPerspectiveLayers(options: {
  target: Canvas2DContext;
  width: number;
  height: number;
  transform: PerspectiveTransform;
  drawLayers: (target: Canvas2DContext) => void;
}) {
  compositor ??= new PerspectiveSceneCompositor();
  compositor.render({
    target: options.target,
    bounds: { x: 0, y: 0, width: options.width, height: options.height },
    pixelScale: 1,
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
