import { it, expect } from 'vitest';
import { createStillDocument, createColorEffect, createGradientEffect } from '@beam/engine';
import { screenshotLayers } from '@beam/engine/screenshot/screenshot-layers';
import { compositionThumbnailIds, effectThumbnailId, effectThumbnailRevision } from '../effect-thumbnail';
it('separates equal effect identities on different owners without ambiguous delimiters', () => {
  expect(effectThumbnailId('a', 'b:c')).not.toBe(effectThumbnailId('a:b', 'c'));
  expect(effectThumbnailId('a', 'fx')).not.toBe(effectThumbnailId('b', 'fx'));
  expect(effectThumbnailId('a', 'fx')).toBe(effectThumbnailId('a', 'fx'));
});
it('retains base and intermediate thumbnail IDs and clears removed effects', () => {
  const layer = screenshotLayers(createStillDocument('test', 'source.png', 100, 100).state)[0]!;
  layer.effects = [createGradientEffect('a'), createColorEffect('b')];
  expect([...compositionThumbnailIds([layer])]).toEqual([
    layer.id,
    effectThumbnailId(layer.id, 'a'),
    effectThumbnailId(layer.id, 'b'),
  ]);
  delete layer.effects;
  expect([...compositionThumbnailIds([layer])]).toEqual([layer.id]);
  expect([...compositionThumbnailIds([])]).toEqual([]);
});
it('invalidates row memoization when an effect image completes without replacing its parent image', () => {
  const layer = screenshotLayers(createStillDocument('test', 'source.png', 100, 100).state)[0]!;
  expect(effectThumbnailRevision(layer, {})).toBe('');
  layer.effects = [createColorEffect('x'), createGradientEffect('y')];
  expect(effectThumbnailRevision(layer, {})).toBe('|');
  const id = effectThumbnailId(layer.id, 'x');
  expect(effectThumbnailRevision(layer, { [id]: { revision: 1, status: 'loading' } })).toBe('1:loading|');
  expect(effectThumbnailRevision(layer, { [id]: { revision: 1, status: 'ready', url: 'blob:ready' } })).toBe(
    '1:ready|',
  );
});
