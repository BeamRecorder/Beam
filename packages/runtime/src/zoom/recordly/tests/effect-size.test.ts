// @vitest-environment node
import { expect, it } from 'vitest';
import { recordlyEffectAtSize } from '../effect-size';
import type { RecordlyFrameEffect } from '@beam/engine/zoom/experimental/recordly-camera-types';
const effect: RecordlyFrameEffect = {
  width: 100,
  height: 50,
  transform: { scale: 1.8, x: -20, y: 10 },
  pan: { velocity: { x: 3, y: 4 }, offset: -5 / 32, kernelSize: 13 },
  zoom: { center: { x: 40, y: 20 }, strength: 0.2, innerRadius: 6, radius: 80 },
};
it('retains an already composed effect at the same resolution', () => {
  expect(recordlyEffectAtSize(effect, 100, 50)).toBe(effect);
});
it('scales stage-pixel uniforms without re-advancing the camera or altering the source', () => {
  const before = structuredClone(effect),
    next = recordlyEffectAtSize(effect, 200, 100);
  expect(next).toEqual({
    width: 200,
    height: 100,
    transform: { scale: 1.8, x: -40, y: 20 },
    pan: { velocity: { x: 6, y: 8 }, offset: -10 / 32, kernelSize: 13 },
    zoom: { center: { x: 80, y: 40 }, strength: 0.2, innerRadius: 12, radius: 160 },
  });
  expect(effect).toEqual(before);
});
it('keeps infinite radial radius and handles a stationary directional pass without division by zero', () => {
  const next = recordlyEffectAtSize(
    { ...effect, pan: { ...effect.pan, velocity: { x: 0, y: 0 } }, zoom: { ...effect.zoom, radius: -1 } },
    200,
    50,
  );
  expect(next.pan).toEqual({ ...effect.pan, velocity: { x: 0, y: 0 }, offset: 0 });
  expect(next.zoom.radius).toBe(-1);
  expect(next.zoom.innerRadius).toBe(6);
});
