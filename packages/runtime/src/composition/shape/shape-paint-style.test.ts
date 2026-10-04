import { describe, expect, it } from 'vitest';
import { normalizeShapeLayerStyle } from '@beam/engine/shared/shape-layer-style';
import { shapePaintStyle } from './shape-paint-style';
import { shape } from './tests/gpu-shape.fixtures';

describe('retained shape paint styles', () => {
  it('normalizes once and reuses the same style across native painting and camera changes', () => {
    const clip = shape();
    const first = shapePaintStyle(clip);
    expect(first).toEqual(normalizeShapeLayerStyle(clip));
    expect(shapePaintStyle(clip)).toBe(first);
  });
  it('uses replacement edit and keyframe records immediately without modifying the original', () => {
    const clip = shape(),
      first = shapePaintStyle(clip);
    const edited = { ...clip, opacityEnabled: true, opacity: 37, fillColor: '#123456' };
    expect(shapePaintStyle(edited)).toMatchObject({ opacity: 37, fillColor: '#123456' });
    expect(shapePaintStyle(edited)).not.toBe(first);
    expect(shapePaintStyle(clip)).toBe(first);
    expect(first.opacityEnabled).toBe(false);
  });
  it('keeps independent clips independent and preserves normalized incomplete legacy styles', () => {
    const one = shape({ borderColor: 'invalid', opacity: NaN }),
      two = { ...one };
    expect(shapePaintStyle(one)).toEqual(normalizeShapeLayerStyle(one));
    expect(shapePaintStyle(two)).toEqual(shapePaintStyle(one));
    expect(shapePaintStyle(two)).not.toBe(shapePaintStyle(one));
  });
  it.each([
    { rotation: 23 },
    { fillColor: '#abcdef' },
    { opacity: 32, opacityEnabled: true },
    { borderWidth: 12 },
    { shadowEnabled: true },
    { preset: 'ellipse' },
  ] as const)('invalidates mutable still-editor property drafts %j', (patch) => {
    const clip = shape(),
      first = shapePaintStyle(clip);
    Object.assign(clip, patch);
    expect(shapePaintStyle(clip)).toEqual(normalizeShapeLayerStyle(clip));
    expect(shapePaintStyle(clip)).not.toBe(first);
  });
});
