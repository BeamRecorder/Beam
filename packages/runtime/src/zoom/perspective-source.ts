import type { MediaRect } from '@beam/engine/shared/geometry-types';
import type { Clip } from '@beam/engine/shared/composition-types';
import { emptyComposition, isVisualClip, isShapeClip } from '@beam/engine/shared/composition-types';
import { frameOuterRect } from '@beam/engine/shared/frame-layout';
import { rotateMediaVector } from '@beam/engine/layout/media-rotation';
import { createScenePointMapper } from '@beam/engine/scene/scene-spatial';
import type { SceneGraph } from '@beam/engine/scene/scene-types';
import { shadowBlurForAppearance } from '../composition/appearance/render-decorated-media';
import type { CameraPlaneView } from '@beam/engine/zoom/camera-plane-types';

/** Includes complete frame chrome and shadow halos, also through parent group transforms. */
export function perspectiveSourceBounds(
  canvas: { width: number; height: number },
  clips: readonly Clip[],
  appearanceScale = 1,
  scene?: SceneGraph,
  bleed = 0,
): MediaRect {
  const { width, height } = canvas;
  const map = scene ? createScenePointMapper({ ...emptyComposition(), scene }, width, height) : undefined;
  let left = 0 - bleed,
    top = 0 - bleed,
    right = width + bleed,
    bottom = height + bleed;
  for (const clip of clips) {
    if (!('transform' in clip) || !clip.transform) continue;
    const t = clip.transform,
      rect = { x: t.x * width, y: t.y * height, width: t.width * width, height: t.height * height };
    const outer = isVisualClip(clip) ? frameOuterRect(rect, clip.appearance.frame) : rect;
    const shadow = isVisualClip(clip)
      ? shadowBlurForAppearance(clip.appearance) * appearanceScale
      : isShapeClip(clip) && clip.shadowEnabled
        ? (clip.shadowBlur * Math.min(width, height)) / 1080
        : 0;
    const border = isVisualClip(clip)
      ? clip.appearance.borderEnabled
        ? clip.appearance.borderWidth
        : 0
      : isShapeClip(clip)
        ? (clip.borderWidth * Math.min(width, height)) / 1080
        : 0;
    const pad = 4 * shadow + border + 2,
      rotation = 'rotation' in clip ? (clip.rotation ?? 0) : 0;
    for (const x of [-pad, outer.width + pad])
      for (const y of [-pad, outer.height + pad]) {
        const p = rotateMediaVector({ x: x - outer.width / 2, y: y - outer.height / 2 }, rotation);
        const point = {
          cx: (outer.x + outer.width / 2 + p.x) / width,
          cy: (outer.y + outer.height / 2 + p.y) / height,
        };
        const world = map ? map(clip.id, point, 0) : point;
        left = Math.min(left, world.cx * width);
        right = Math.max(right, world.cx * width);
        top = Math.min(top, world.cy * height);
        bottom = Math.max(bottom, world.cy * height);
      }
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** A complete scene texture stays within 64 MiB and the GPU's maximum texture dimension. */
export function perspectiveSourceSize(bounds: MediaRect, pixelScale: number, maxSize: number) {
  if (
    ![bounds.x, bounds.y, bounds.width, bounds.height, pixelScale, maxSize].every(Number.isFinite) ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    pixelScale <= 0 ||
    maxSize < 1
  )
    throw new RangeError('Invalid perspective source bounds.');
  const scale = Math.min(
    pixelScale,
    maxSize / bounds.width,
    maxSize / bounds.height,
    Math.sqrt((16 * 1024 * 1024) / (bounds.width * bounds.height)),
  );
  return {
    width: Math.max(1, Math.floor(bounds.width * scale)),
    height: Math.max(1, Math.floor(bounds.height * scale)),
  };
}

/** Match the final camera's pixel phase, avoiding a second fractional text resampling. */
export function perspectiveSourceRaster(
  bounds: MediaRect,
  viewport: MediaRect,
  camera: CameraPlaneView,
  pixelScale: number,
  maxSize: number,
) {
  if (
    ![viewport.x, viewport.y, viewport.width, viewport.height, camera.scale, camera.focusX, camera.focusY].every(
      Number.isFinite,
    ) ||
    camera.scale <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0
  )
    throw new RangeError('Invalid perspective camera.');
  const requested = pixelScale * Math.max(1, camera.scale);
  perspectiveSourceSize(bounds, requested, maxSize);
  if (maxSize < 3) throw new RangeError('Perspective texture dimension is too small.');
  // Two device pixels guard outward rounding, also when memory limits reduce density.
  const sum = bounds.width + bounds.height,
    area = bounds.width * bounds.height,
    budget = 16 * 1024 * 1024 - 4;
  const memoryDensity = budget / (Math.sqrt(sum * sum + area * budget) + sum);
  const density = Math.min(requested, (maxSize - 2) / bounds.width, (maxSize - 2) / bounds.height, memoryDensity);
  if (!Number.isFinite(density) || density <= 0) throw new RangeError('Invalid perspective raster density.');
  const phaseX = (viewport.width / 2 - (viewport.x + camera.focusX * viewport.width) * camera.scale) * pixelScale;
  const phaseY = (viewport.height / 2 - (viewport.y + camera.focusY * viewport.height) * camera.scale) * pixelScale;
  const left = Math.floor(bounds.x * density + phaseX + 1e-8),
    top = Math.floor(bounds.y * density + phaseY + 1e-8);
  const right = Math.ceil((bounds.x + bounds.width) * density + phaseX - 1e-8),
    bottom = Math.ceil((bounds.y + bounds.height) * density + phaseY - 1e-8);
  return {
    bounds: {
      x: (left - phaseX) / density,
      y: (top - phaseY) / density,
      width: (right - left) / density,
      height: (bottom - top) / density,
    },
    size: { width: Math.max(1, right - left), height: Math.max(1, bottom - top) },
  };
}
