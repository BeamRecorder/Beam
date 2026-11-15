import type { RecordlyFrameEffect } from '@beam/engine/zoom/experimental/recordly-camera-types';

/** Oversampled Beam lenses reuse the composed camera; filter controls remain in target-stage pixels. */
export function recordlyEffectAtSize(effect: RecordlyFrameEffect, width: number, height: number): RecordlyFrameEffect {
  if (effect.width === width && effect.height === height) return effect;
  const sx = width / effect.width,
    sy = height / effect.height;
  const velocity = { x: effect.pan.velocity.x * sx, y: effect.pan.velocity.y * sy };
  const magnitude = Math.hypot(effect.pan.velocity.x, effect.pan.velocity.y);
  const radiusScale = Math.min(sx, sy);
  return {
    ...effect,
    width,
    height,
    transform: { ...effect.transform, x: effect.transform.x * sx, y: effect.transform.y * sy },
    pan: {
      ...effect.pan,
      velocity,
      offset: magnitude > 0 ? (effect.pan.offset * Math.hypot(velocity.x, velocity.y)) / magnitude : 0,
    },
    zoom: {
      ...effect.zoom,
      center: { x: effect.zoom.center.x * sx, y: effect.zoom.center.y * sy },
      innerRadius: effect.zoom.innerRadius * radiusScale,
      radius: effect.zoom.radius < 0 ? effect.zoom.radius : effect.zoom.radius * radiusScale,
    },
  };
}
