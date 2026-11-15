import type { Canvas2DContext } from '../../canvas-types';
import type { RecordlyFrameEffect } from '@beam/engine/zoom/experimental/recordly-camera-types';
import { recordlyEffectAtSize } from './effect-size';
import { RecordlySpatialFilter } from './spatial-filter';
let surface: OffscreenCanvas | null = null,
  filter: RecordlySpatialFilter | null = null;
export const hasRecordlyBlur = (effect: RecordlyFrameEffect | undefined) =>
  Boolean(effect && (effect.zoom.strength > 0 || effect.pan.velocity.x !== 0 || effect.pan.velocity.y !== 0));

/** Shadow follows the camera outside the filter; only the masked video/frame layer enters the spatial kernel. */
export function drawRecordlyVideoLayer(
  target: Canvas2DContext,
  base: DOMMatrix,
  width: number,
  height: number,
  effect: RecordlyFrameEffect,
  draw: (context: Canvas2DContext, pass: 'shadow' | 'content') => void,
) {
  draw(target, 'shadow');
  surface ??= new OffscreenCanvas(width, height);
  if (surface.width !== width) surface.width = width;
  if (surface.height !== height) surface.height = height;
  const context = surface.getContext('2d');
  if (!context) throw new Error('Recordly video layer canvas unavailable.');
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.setTransform(base.inverse().multiply(target.getTransform()));
  draw(context, 'content');
  filter ??= new RecordlySpatialFilter();
  const result = filter.draw(surface, recordlyEffectAtSize(effect, width, height));
  target.save();
  try {
    target.setTransform(base);
    target.drawImage(result, 0, 0, width, height);
  } finally {
    target.restore();
  }
}
export function disposeRecordlyVideoLayer() {
  filter?.dispose();
  filter = null;
  if (surface) surface.width = surface.height = 0;
  surface = null;
}
