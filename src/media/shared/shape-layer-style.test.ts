import { describe, expect, it } from 'vitest';
import { DEFAULT_SHAPE_LAYER_STYLE, normalizeShapeLayerStyle } from './shape-layer-style';

describe('normalizeShapeLayerStyle', () => {
  it('keeps valid arrow styles and clamps finite numeric values', () => {
    expect(
      normalizeShapeLayerStyle({
        family: 'arrow',
        preset: 'arrow',
        rotation: 400,
        borderWidth: 90,
        opacityEnabled: true,
        opacity: -20,
        backdropBlur: 120,
      }),
    ).toMatchObject({
      family: 'arrow',
      preset: 'arrow',
      rotation: 360,
      borderWidth: 40,
      opacityEnabled: true,
      opacity: 0,
      backdropBlur: 100,
    });
  });

  it('falls back for non-finite values and incompatible presets', () => {
    expect(
      normalizeShapeLayerStyle({
        family: 'shape',
        preset: 'arrow',
        opacity: Number.NaN,
        backdropBlur: Number.NEGATIVE_INFINITY,
        shadowBlur: Number.POSITIVE_INFINITY,
      }),
    ).toMatchObject({
      preset: 'rounded-rectangle',
      opacity: DEFAULT_SHAPE_LAYER_STYLE.opacity,
      backdropBlur: DEFAULT_SHAPE_LAYER_STYLE.backdropBlur,
      shadowBlur: DEFAULT_SHAPE_LAYER_STYLE.shadowBlur,
    });
  });
});
