import { describe, it, expect } from 'vitest';
import { createDitheringEffect, DEFAULT_DITHERING_RECIPE, validateDitheringRecipe } from './dithering-schema.js';
import { validateLayerEffects } from './gradient-schema.js';
import { LAYER_BLEND_MODES } from '../shared/layer-compositing';
import { createAuthoringSession, createStillDocument } from '../index';
describe('persisted dithering', () => {
  it('creates independent palettes and accepts the smallest and largest recipes', () => {
    const a = createDitheringEffect('a'),
      b = createDitheringEffect('b');
    a.recipe.colors[0] = '#f00';
    expect(b.recipe).toEqual(DEFAULT_DITHERING_RECIPE);
    expect(DEFAULT_DITHERING_RECIPE.colors[0]).toBe('#000000');
    for (const matrixSize of [2, 4, 8])
      for (const pixelSize of [1, 16]) validateDitheringRecipe({ ...b.recipe, matrixSize, pixelSize });
    validateDitheringRecipe({ ...b.recipe, colors: Array(8).fill('#abc') });
    validateLayerEffects([a, b], LAYER_BLEND_MODES);
  });
  it.each([
    null,
    [],
    false,
    { version: 2 },
    { extra: 0 },
    { matrixSize: 3 },
    { matrixSize: '4' },
    { pixelSize: 0 },
    { pixelSize: 17 },
    { pixelSize: NaN },
    { pixelSize: Infinity },
    { pixelSize: undefined },
    { colors: [] },
    { colors: ['#fff'] },
    { colors: Array(9).fill('#fff') },
    { colors: ['red', '#fff'] },
    { colors: ['#ffffff00', '#fff'] },
    { colors: [3, '#fff'] },
  ])('rejects malformed recipe %#', (patch) => {
    const value =
      patch && !Array.isArray(patch) && typeof patch === 'object' ? { ...DEFAULT_DITHERING_RECIPE, ...patch } : patch;
    expect(() => validateDitheringRecipe(value)).toThrow();
  });
  it('requires a source-over effect and its complete recipe', () => {
    const effect = createDitheringEffect('x');
    expect(() => validateLayerEffects([{ ...effect, blendMode: 'multiply' }], LAYER_BLEND_MODES)).toThrow();
    expect(() => validateLayerEffects([{ ...effect, recipe: { version: 1 } }], LAYER_BLEND_MODES)).toThrow();
  });
  it('persists and restores the recipe with undo/redo and rejects invalid edits atomically', async () => {
    const session = createAuthoringSession(createStillDocument('dither', 'source.png', 100, 100));
    const effect = createDitheringEffect('dither');
    session.execute({ type: 'still.layer.compositing', payload: { layerId: 'image', patch: { effects: [effect] } } });
    const saved = JSON.stringify(session.document);
    expect(session.document.state.composition!.find((layer) => layer.id === 'image')!.effects).toEqual([effect]);
    await session.undo();
    await session.redo();
    expect(JSON.stringify(session.document)).toBe(saved);
    expect(() =>
      session.execute({
        type: 'still.layer.compositing',
        payload: { layerId: 'image', patch: { effects: [{ ...effect, recipe: { ...effect.recipe, pixelSize: 0 } }] } },
      }),
    ).toThrow();
    expect(JSON.stringify(session.document)).toBe(saved);
  });
});
it('validates JJN, mapping, pixelation and source tuning without accepting unknown values', () => {
  validateDitheringRecipe({
    ...DEFAULT_DITHERING_RECIPE,
    algorithm: 'jarvis-judice-ninke',
    mapping: 'luminance',
    brightness: 0,
    contrast: 200,
    blockSize: 16,
  });
  for (const patch of [
    { algorithm: 'unknown' },
    { mapping: 'unknown' },
    { blockSize: 0 },
    { blockSize: 17 },
    { blockSize: 1.2 },
    { brightness: NaN },
    { brightness: -1 },
    { brightness: 201 },
    { contrast: -1 },
    { contrast: 201 },
  ])
    expect(() => validateDitheringRecipe({ ...DEFAULT_DITHERING_RECIPE, ...patch })).toThrow();
  expect(() => validateDitheringRecipe({})).toThrow();
});
