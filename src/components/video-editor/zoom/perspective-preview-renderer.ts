import type { ZoomElement } from './zoom-types';
import { normalizeZoomProjection } from './zoom-types';
import { PerspectiveSceneCompositor } from './perspective-scene-compositor';

const hasNearbyPerspective = (zooms: readonly ZoomElement[], timeMs: number) =>
  zooms.some(
    (zoom) =>
      normalizeZoomProjection(zoom.projection) === '3d' &&
      timeMs >= zoom.startMs - 2_000 &&
      timeMs <= zoom.endMs + 2_000,
  );

export class PerspectivePreviewRenderer {
  private readonly compositor = new PerspectiveSceneCompositor();

  render<T extends { tiltX?: number; tiltY?: number }>(options: {
    target: CanvasRenderingContext2D;
    bounds: { x: number; y: number; width: number; height: number };
    pixelScale: number;
    timeMs: number;
    zooms: readonly ZoomElement[];
    drawScene: (context: CanvasRenderingContext2D) => T;
  }): T {
    if (!hasNearbyPerspective(options.zooms, options.timeMs)) return options.drawScene(options.target);
    let result: T | null = null;
    this.compositor.render({
      target: options.target,
      bounds: options.bounds,
      pixelScale: options.pixelScale,
      draw: (context) => {
        result = options.drawScene(context as CanvasRenderingContext2D);
        return { tiltX: result.tiltX ?? 0, tiltY: result.tiltY ?? 0 };
      },
    });
    if (!result) throw new Error('Unable to resolve the perspective zoom camera window.');
    return result;
  }

  dispose() {
    this.compositor.dispose();
  }
}
