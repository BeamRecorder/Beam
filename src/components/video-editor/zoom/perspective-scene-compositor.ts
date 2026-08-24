import type { Canvas2DContext } from '~/types/canvas';
import type { PerspectiveTransform } from './perspective-projection';
import { hasPerspectiveTilt } from './perspective-projection';
import { WebGlPerspectiveProjector, type PerspectiveCanvas } from './webgl-perspective-projector';

type SceneSurface = PerspectiveCanvas;

const createSceneSurface = (width: number, height: number): SceneSurface => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

export class PerspectiveSceneCompositor {
  private surface: SceneSurface | null = null;
  private context: Canvas2DContext | null = null;
  private projector: WebGlPerspectiveProjector | null = null;

  render(options: {
    target: Canvas2DContext;
    bounds: { x: number; y: number; width: number; height: number };
    pixelScale: number;
    draw: (context: Canvas2DContext) => PerspectiveTransform;
  }) {
    const { bounds } = options;
    const pixelScale = Math.min(1.25, Math.max(1e-6, options.pixelScale));
    const width = Math.max(1, Math.round(bounds.width * pixelScale));
    const height = Math.max(1, Math.round(bounds.height * pixelScale));
    this.surface ??= createSceneSurface(width, height);
    if (this.surface.width !== width) this.surface.width = width;
    if (this.surface.height !== height) this.surface.height = height;
    this.context ??= this.surface.getContext('2d') as Canvas2DContext | null;
    if (!this.context) throw new Error('Canvas2D is required to compose a perspective zoom scene.');
    const context = this.context;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    context.setTransform(pixelScale, 0, 0, pixelScale, -bounds.x * pixelScale, -bounds.y * pixelScale);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    const transform = options.draw(context);
    if (!hasPerspectiveTilt(transform)) {
      options.target.drawImage(this.surface, bounds.x, bounds.y, bounds.width, bounds.height);
      return;
    }
    this.projector ??= new WebGlPerspectiveProjector();
    const projected = this.projector.render(this.surface as TexImageSource, width, height, transform);
    options.target.drawImage(projected, bounds.x, bounds.y, bounds.width, bounds.height);
  }

  dispose() {
    this.projector?.dispose();
    this.projector = null;
    this.context = null;
    this.surface = null;
  }
}
