import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import type { PerspectiveTransform } from '@beam/engine/zoom/perspective-projection';
import { hasPerspectiveTilt } from '@beam/engine/zoom/perspective-projection';
import { WebGlPerspectiveProjector, type PerspectiveCanvas } from '@beam/runtime/zoom/webgl-perspective-projector';
import { cameraPlaneGeometry } from '@beam/engine/zoom/camera-plane';
import type { CameraPlaneView } from '@beam/engine/zoom/camera-plane-types';
import type { MediaRect } from '@beam/engine/shared/geometry-types';
import { perspectiveSourceRaster } from './perspective-source';
import { disposeSceneStack } from '../rendering/scene-stack';
import { disposeMediaShadowCache } from '../composition/appearance/media-shadow-cache';
import type { PerspectiveCameraSample } from './perspective-projector-types';

const createSceneSurface = (width: number, height: number): PerspectiveCanvas => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

export class PerspectiveSceneCompositor {
  private surface: PerspectiveCanvas | null = null;
  private context: Canvas2DContext | null = null;
  private projector: WebGlPerspectiveProjector | null = null;

  render(options: {
    target: Canvas2DContext;
    bounds: { x: number; y: number; width: number; height: number };
    pixelScale: number;
    camera?: CameraPlaneView;
    sourceBounds?: MediaRect;
    draw: (context: Canvas2DContext) => PerspectiveTransform;
  }) {
    const { bounds } = options;
    const { context, surface, sourceBounds, size, width, height } = this.prepareSource(
      bounds,
      options.pixelScale,
      options.camera,
      options.sourceBounds,
    );
    const transform = options.draw(context);
    if (!hasPerspectiveTilt(transform)) {
      const camera = options.camera;
      options.target.drawImage(
        surface,
        camera
          ? bounds.x + bounds.width / 2 + (sourceBounds.x - bounds.x - camera.focusX * bounds.width) * camera.scale
          : bounds.x,
        camera
          ? bounds.y + bounds.height / 2 + (sourceBounds.y - bounds.y - camera.focusY * bounds.height) * camera.scale
          : bounds.y,
        camera ? sourceBounds.width * camera.scale : bounds.width,
        camera ? sourceBounds.height * camera.scale : bounds.height,
      );
      return;
    }
    let projected: PerspectiveCanvas;
    try {
      this.projector ??= new WebGlPerspectiveProjector();
      projected = options.camera
        ? this.projector.renderGeometry(
            this.surface as TexImageSource,
            width,
            height,
            cameraPlaneGeometry(bounds.width, bounds.height, transform, options.camera, {
              ...sourceBounds,
              x: sourceBounds.x - bounds.x,
              y: sourceBounds.y - bounds.y,
            }).positions,
            size,
          )
        : this.projector.render(this.surface as TexImageSource, width, height, transform);
    } catch (error) {
      this.projector?.dispose();
      this.projector = null;
      if (transform.orbit) throw error;
      options.target.drawImage(surface, bounds.x, bounds.y, bounds.width, bounds.height);
      return;
    }
    options.target.drawImage(projected, bounds.x, bounds.y, bounds.width, bounds.height);
  }

  private prepareSource(bounds: MediaRect, requestedScale: number, camera?: CameraPlaneView, sourceBounds?: MediaRect) {
    const pixelScale = Math.min(1.25, Math.max(1e-6, requestedScale));
    const width = Math.max(1, Math.round(bounds.width * pixelScale));
    const height = Math.max(1, Math.round(bounds.height * pixelScale));
    if (camera) this.projector ??= new WebGlPerspectiveProjector();
    // Rasterize at the authored zoom density before projection, preserving small text.
    const raster = camera
      ? perspectiveSourceRaster(sourceBounds ?? bounds, bounds, camera, pixelScale, this.projector!.maxTextureSize)
      : { bounds, size: { width, height } };
    const { bounds: actualBounds, size } = raster;
    this.surface ??= createSceneSurface(size.width, size.height);
    if (this.surface.width !== size.width) this.surface.width = size.width;
    if (this.surface.height !== size.height) this.surface.height = size.height;
    this.context ??= this.surface.getContext('2d') as Canvas2DContext | null;
    if (!this.context) throw new Error('Canvas2D is required to compose a perspective zoom scene.');
    const context = this.context;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    const sx = camera ? size.width / actualBounds.width : pixelScale,
      sy = camera ? size.height / actualBounds.height : pixelScale;
    context.setTransform(sx, 0, 0, sy, -actualBounds.x * sx, -actualBounds.y * sy);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    return { context, surface: this.surface, sourceBounds: actualBounds, size, width, height };
  }

  renderSamples(options: {
    target: Canvas2DContext;
    bounds: MediaRect;
    pixelScale: number;
    sourceBounds: MediaRect;
    samples: readonly PerspectiveCameraSample[];
    draw(context: Canvas2DContext): void;
  }) {
    if (!options.samples.length) throw new RangeError('Perspective exposure needs at least one pose.');
    const center = options.samples[Math.floor(options.samples.length / 2)]!.camera;
    const camera = { ...center, scale: Math.max(...options.samples.map((sample) => sample.camera.scale)) };
    const { context, surface, sourceBounds, size, width, height } = this.prepareSource(
      options.bounds,
      options.pixelScale,
      camera,
      options.sourceBounds,
    );
    try {
      options.draw(context);
      const source = { ...sourceBounds, x: sourceBounds.x - options.bounds.x, y: sourceBounds.y - options.bounds.y };
      const samples = options.samples.map((sample) => ({
        positions: cameraPlaneGeometry(
          options.bounds.width,
          options.bounds.height,
          sample.transform,
          sample.camera,
          source,
        ).positions,
        weight: sample.weight,
      }));
      const projected = this.projector!.renderSamples(surface as TexImageSource, width, height, samples, size);
      options.target.drawImage(
        projected,
        options.bounds.x,
        options.bounds.y,
        options.bounds.width,
        options.bounds.height,
      );
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  dispose() {
    this.projector?.dispose();
    this.projector = null;
    if (this.context) {
      disposeSceneStack(this.context);
      disposeMediaShadowCache(this.context);
    }
    if (this.surface) this.surface.width = this.surface.height = 0;
    this.context = null;
    this.surface = null;
  }
}
