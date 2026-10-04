import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GRADIENT_RECIPE,
  GRADIENT_RANGES,
  validateGradientRecipe,
  validateLayerEffects,
} from './gradient-schema.js';
import { createGradientEffect, GRADIENT_PRESETS } from './gradient-presets';
import { LAYER_BLEND_MODES } from '../shared/layer-compositing';
import { createAuthoringSession, createStillDocument } from '../index';
const recipe = () => structuredClone(DEFAULT_GRADIENT_RECIPE);
describe('portable gradient recipes and attached effects', () => {
  it('accepts every BEBE-ui preset and owns each new palette independently', () => {
    for (const preset of GRADIENT_PRESETS) expect(() => validateGradientRecipe(preset.recipe)).not.toThrow();
    const first = createGradientEffect('first'),
      second = createGradientEffect('second');
    first.recipe.colors[0] = '#ffffff';
    expect(second.recipe.colors[0]).toBe('#2457ff');
    expect(() => validateLayerEffects([second], LAYER_BLEND_MODES)).not.toThrow();
  });
  it.each(Object.entries(GRADIENT_RANGES))('enforces complete finite bounds for %s', (key, [min, max]) => {
    for (const value of [min, max]) expect(() => validateGradientRecipe({ ...recipe(), [key]: value })).not.toThrow();
    for (const value of [min - 1, max + 1, NaN, Infinity, undefined, '1'])
      expect(() => validateGradientRecipe({ ...recipe(), [key]: value })).toThrow(key);
  });
  it.each([
    null,
    [],
    {},
    { ...recipe(), version: 2 },
    { ...recipe(), mode: 'css' },
    { ...recipe(), colors: ['#fff'] },
    { ...recipe(), colors: Array(9).fill('#fff') },
    { ...recipe(), colors: ['red', '#fff'] },
    { ...recipe(), background: '#ffffff80' },
    { ...recipe(), animated: true },
    { ...recipe(), seed: 1.5 },
    { ...recipe(), octaves: 2.5 },
  ])('rejects invalid or animated recipes %#', (value) => expect(() => validateGradientRecipe(value)).toThrow());
  it('accepts two/eight colors and rejects invalid effect identities, kinds and opacity', () => {
    validateGradientRecipe({ ...recipe(), colors: ['#abc', '#def'] });
    validateGradientRecipe({ ...recipe(), colors: Array(8).fill('#abcdef') });
    const effect = createGradientEffect('effect');
    for (const patch of [
      { id: '' },
      { kind: 'shader' },
      { enabled: 1 },
      { opacity: NaN },
      { opacity: -1 },
      { opacity: 101 },
      { blendMode: 'copy' },
      { unknown: true },
    ])
      expect(() => validateLayerEffects([{ ...effect, ...patch }], LAYER_BLEND_MODES)).toThrow();
    expect(() => validateLayerEffects([effect, effect], LAYER_BLEND_MODES)).toThrow();
    expect(() =>
      validateLayerEffects(
        Array.from({ length: 5 }, (_, i) => createGradientEffect(String(i))),
        LAYER_BLEND_MODES,
      ),
    ).toThrow();
    expect(() => validateLayerEffects({}, LAYER_BLEND_MODES)).toThrow();
    validateLayerEffects([], LAYER_BLEND_MODES);
  });
  it('persists the effect through still commands, undo/redo and revision snapshots', async () => {
    const session = createAuthoringSession(createStillDocument('test', 'source.png', 100, 100));
    const effect = createGradientEffect('gradient');
    session.execute({ type: 'still.layer.compositing', payload: { layerId: 'image', patch: { effects: [effect] } } });
    expect(session.document.state.composition?.find((layer) => layer.id === 'image')?.effects).toEqual([effect]);
    await session.undo();
    expect(session.document.state.composition?.find((layer) => layer.id === 'image')?.effects).toBeUndefined();
    await session.redo();
    expect(session.document.state.composition?.find((layer) => layer.id === 'image')?.effects).toEqual([effect]);
  });
  it('rejects invalid and locked edits without changing the document', () => {
    const session = createAuthoringSession(createStillDocument('test', 'source.png', 100, 100));
    const original = JSON.stringify(session.document);
    expect(() =>
      session.execute({
        type: 'still.layer.compositing',
        payload: {
          layerId: 'image',
          patch: { effects: [{ ...createGradientEffect('x'), recipe: { ...recipe(), grain: 1000 } }] },
        },
      }),
    ).toThrow();
    expect(JSON.stringify(session.document)).toBe(original);
    session.execute({ type: 'still.layer.compositing', payload: { layerId: 'image', patch: { locked: true } } });
    expect(() =>
      session.execute({
        type: 'still.layer.compositing',
        payload: { layerId: 'image', patch: { effects: [createGradientEffect('x')] } },
      }),
    ).toThrow('locked');
  });
});
