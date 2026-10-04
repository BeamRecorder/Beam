import { it, expect } from 'vitest';
import { createGradientEffect, createStillDocument } from '@beam/engine';
import { screenshotLayers } from '@beam/engine/screenshot/screenshot-layers';
import { layerControlDisabledReason, layerEffectDisabledReason } from './composition-disabled-reason';
const layer = () => screenshotLayers(createStillDocument('test', 'source.png', 100, 100).state)[1]!;
it('requires selection while keeping an editable selected layer enabled', () => {
  expect(layerControlDisabledReason()).toBe('selectElement');
  expect(layerEffectDisabledReason()).toBe('selectElement');
  expect(layerControlDisabledReason(layer())).toBeUndefined();
  expect(layerEffectDisabledReason(layer())).toBeUndefined();
});
it('explains busy and locked controls in order of the actual blocking state', () => {
  const item = { ...layer(), locked: true };
  expect(layerControlDisabledReason(item)).toBe('locked');
  expect(layerEffectDisabledReason(item)).toBe('locked');
  expect(layerControlDisabledReason(item, true)).toBe('busy');
  expect(layerEffectDisabledReason(undefined, true)).toBe('busy');
});
it('explains unsupported and full effect stacks without disabling layer compositing', () => {
  for (const kind of ['effect', 'zoom'] as const)
    expect(layerEffectDisabledReason({ ...layer(), kind })).toBe('unsupported');
  const item = { ...layer(), effects: Array.from({ length: 4 }, (_, id) => createGradientEffect(String(id))) };
  expect(layerEffectDisabledReason(item)).toBe('effectLimit');
  expect(layerControlDisabledReason(item)).toBeUndefined();
  item.effects.pop();
  expect(layerEffectDisabledReason(item)).toBeUndefined();
});
