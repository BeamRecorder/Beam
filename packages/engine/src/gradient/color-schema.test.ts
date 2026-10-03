import { describe, it, expect } from 'vitest';
import { COLOR_RANGES, DEFAULT_COLOR_RECIPE, createColorEffect, validateColorRecipe } from './color-schema.js';
import { validateLayerEffects } from './gradient-schema.js';
import { LAYER_BLEND_MODES } from '../shared/layer-compositing';
import { createAuthoringSession, createStillDocument } from '../index';
describe('Persisted color adjustments', () => {
  it('creates independent neutral and monochrome recipes', () => {
    const first = createColorEffect('first'),
      second = createColorEffect('second', true);
    expect(first.recipe).toEqual(DEFAULT_COLOR_RECIPE);
    expect(second.recipe.grayscale).toBe(100);
    first.recipe.hue = 30;
    expect(second.recipe.hue).toBe(0);
    expect(DEFAULT_COLOR_RECIPE.hue).toBe(0);
    validateLayerEffects([first, second], LAYER_BLEND_MODES);
  });
  it.each(Object.entries(COLOR_RANGES))('validates finite complete bounds for %s', (key, [min, max]) => {
    for (const value of [min, max]) validateColorRecipe({ ...DEFAULT_COLOR_RECIPE, [key]: value });
    for (const value of [min - 1, max + 1, NaN, Infinity, undefined, '100'])
      expect(() => validateColorRecipe({ ...DEFAULT_COLOR_RECIPE, [key]: value })).toThrow(key);
  });
  it.each([null, false, [], {}, { ...DEFAULT_COLOR_RECIPE, version: 2 }, { ...DEFAULT_COLOR_RECIPE, extra: 1 }])(
    'rejects malformed recipes %#',
    (recipe) => expect(() => validateColorRecipe(recipe)).toThrow(),
  );
  it('rejects color blending modes and a gradient recipe disguised as color', () => {
    expect(() =>
      validateLayerEffects([{ ...createColorEffect('x'), blendMode: 'multiply' }], LAYER_BLEND_MODES),
    ).toThrow();
    expect(() =>
      validateLayerEffects(
        [{ ...createColorEffect('x'), recipe: { version: 1, colors: ['#fff', '#000'] } }],
        LAYER_BLEND_MODES,
      ),
    ).toThrow();
  });
  it('round-trips adjustments through transaction history and rejects a bad edit atomically', async () => {
    const session = createAuthoringSession(createStillDocument('color', 'source.png', 100, 100));
    const effect = createColorEffect('adjustments', true);
    effect.recipe.hue = -45;
    session.execute({ type: 'still.layer.compositing', payload: { layerId: 'image', patch: { effects: [effect] } } });
    expect(session.document.state.composition?.find((layer) => layer.id === 'image')?.effects).toEqual([effect]);
    await session.undo();
    expect(session.document.state.composition?.find((layer) => layer.id === 'image')?.effects).toBeUndefined();
    await session.redo();
    const before = JSON.stringify(session.document);
    expect(() =>
      session.execute({
        type: 'still.layer.compositing',
        payload: { layerId: 'image', patch: { effects: [{ ...effect, recipe: { ...effect.recipe, hue: 181 } }] } },
      }),
    ).toThrow();
    expect(JSON.stringify(session.document)).toBe(before);
  });
});
