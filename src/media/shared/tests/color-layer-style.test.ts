import { describe, expect, it } from 'vitest';
import { DEFAULT_COLOR_LAYER_STYLE, normalizeColorLayerStyle } from '../color-layer-style';

describe('normalizeColorLayerStyle', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'falls back for a non-finite corner radius of %s',
    (cornerRadius) => {
      expect(normalizeColorLayerStyle({ cornerRadius }).cornerRadius).toBe(DEFAULT_COLOR_LAYER_STYLE.cornerRadius);
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'falls back for a non-finite shadow blur of %s',
    (shadowBlur) => {
      expect(normalizeColorLayerStyle({ shadowBlur }).shadowBlur).toBe(DEFAULT_COLOR_LAYER_STYLE.shadowBlur);
    },
  );

  it('keeps finite numeric values within their existing bounds', () => {
    expect(normalizeColorLayerStyle({ cornerRadius: 250, shadowBlur: -10 })).toMatchObject({
      cornerRadius: 200,
      shadowBlur: 0,
    });
  });
});
