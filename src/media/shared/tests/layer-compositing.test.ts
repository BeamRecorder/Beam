import { describe, expect, it } from 'vitest';
import { defaultLayerCompositing, LAYER_BLEND_MODES, reorderLayer } from '../layer-compositing';
import type { LayerCompositing } from '../layer-compositing-types';

const layers = (): LayerCompositing[] => [
  { id: 'back', opacity: 100, blendMode: 'source-over', locked: false },
  { id: 'middle', opacity: 70, blendMode: 'multiply', locked: true },
  { id: 'front', opacity: 30, blendMode: 'screen', locked: false },
];

describe('defaultLayerCompositing', () => {
  it('creates a fully opaque unlocked layer with normal source-over blending', () => {
    expect(defaultLayerCompositing('shape-1')).toEqual({
      id: 'shape-1',
      opacity: 100,
      blendMode: 'source-over',
      locked: false,
    });
  });
});

describe('LAYER_BLEND_MODES', () => {
  it('exposes every supported Canvas 2D blend mode', () => {
    expect(LAYER_BLEND_MODES).toEqual([
      'source-over',
      'darken',
      'multiply',
      'color-burn',
      'lighten',
      'screen',
      'color-dodge',
      'lighter',
      'overlay',
      'soft-light',
      'hard-light',
      'difference',
      'exclusion',
      'hue',
      'saturation',
      'color',
      'luminosity',
    ]);
  });
});

describe('reorderLayer', () => {
  it('moves a layer by array index without mutating the back-to-front source list', () => {
    const source = layers();
    const result = reorderLayer(source, 'front', 0);

    expect(result.map(({ id }) => id)).toEqual(['front', 'back', 'middle']);
    expect(source.map(({ id }) => id)).toEqual(['back', 'middle', 'front']);
    expect(result[0]).toBe(source[2]);
    expect(result).not.toBe(source);
  });

  it.each([
    ['below the list', 'front', -20, ['front', 'back', 'middle']],
    ['past the list', 'back', 20, ['middle', 'front', 'back']],
  ] as const)('clamps the target index %s', (_label, id, targetIndex, expected) => {
    expect(reorderLayer(layers(), id, targetIndex).map(({ id }) => id)).toEqual(expected);
  });

  it.each([
    ['an unknown layer', 'missing', 0],
    ['a fractional index', 'front', 1.5],
    ['a NaN index', 'front', Number.NaN],
  ] as const)('returns an unchanged copy for %s', (_label, id, targetIndex) => {
    const source = layers();
    const result = reorderLayer(source, id, targetIndex);

    expect(result).toEqual(source);
    expect(result).not.toBe(source);
  });

  it('returns an empty copy when asked to move an item in an empty list', () => {
    const source: LayerCompositing[] = [];
    const result = reorderLayer(source, 'missing', 0);

    expect(result).toEqual([]);
    expect(result).not.toBe(source);
  });
});
