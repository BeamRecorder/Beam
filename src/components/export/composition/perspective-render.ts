import type { Canvas2DContext } from '~/types/canvas';
import { PerspectiveSceneCompositor } from '../../video-editor/zoom/perspective-scene-compositor';
import type { PerspectiveTransform } from '../../video-editor/zoom/perspective-projection';

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
