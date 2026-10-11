import { it, expect } from 'vitest';
import { ARTISTIC_DEFAULTS, ARTISTIC_RANGES, createArtisticEffect, validateArtisticRecipe } from './artistic-schema.js';
import { validateLayerEffects } from './gradient-schema.js';
import { LAYER_BLEND_MODES } from '../shared/layer-compositing';
import type { ArtisticKind } from './artistic-effect-types';
it.each(['ascii', 'grain', 'cyanotype'] as const)(
  'validates independent %s settings and complete finite bounds',
  (kind) => {
    const effect = createArtisticEffect(kind, 'x');
    validateLayerEffects([effect], LAYER_BLEND_MODES);
    expect(effect.recipe).toEqual(ARTISTIC_DEFAULTS[kind]);
    const ranges = ARTISTIC_RANGES[kind];
    for (const [key, [min, max]] of Object.entries(ranges)) {
      for (const value of [min, max]) validateArtisticRecipe(kind, { ...effect.recipe, [key]: value });
      for (const value of [min - 1, max + 1, NaN, Infinity, undefined, '1'])
        expect(() => validateArtisticRecipe(kind, { ...effect.recipe, [key]: value })).toThrow();
    }
    for (const [key, value] of Object.entries(effect.recipe))
      if (typeof value === 'string' || typeof value === 'boolean')
        expect(() =>
          validateArtisticRecipe(kind, { ...effect.recipe, [key]: typeof value === 'string' ? 'red' : 'yes' }),
        ).toThrow();
    expect(() => validateLayerEffects([{ ...effect, blendMode: 'multiply' }], LAYER_BLEND_MODES)).toThrow();
    expect(() => validateArtisticRecipe(kind, { ...effect.recipe, extra: 1 })).toThrow();
    expect(() => validateArtisticRecipe(kind, { ...effect.recipe, version: 2 })).toThrow();
    effect.recipe.version = 1;
    expect(effect.recipe).not.toBe(ARTISTIC_DEFAULTS[kind]);
  },
);
it('rejects missing, unknown and malformed artistic recipes', () => {
  for (const value of [null, [], false, {}, 0]) expect(() => validateArtisticRecipe('grain', value)).toThrow();
  expect(() => createArtisticEffect('unknown' as ArtisticKind, 'x')).toThrow();
  expect(() => validateArtisticRecipe('unknown' as ArtisticKind, {})).toThrow();
  expect(() => validateArtisticRecipe('grain', { ...ARTISTIC_DEFAULTS.grain, seed: 1.5 })).toThrow();
});
