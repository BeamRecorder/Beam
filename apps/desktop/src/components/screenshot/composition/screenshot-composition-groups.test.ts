import { it, expect } from 'vitest';
import type { ScreenshotLayer } from '@beam/engine/screenshot/screenshot-types';
import { screenshotCompositionGroups } from './screenshot-composition-groups';
const layer = (id: string, groupId?: string): ScreenshotLayer => ({
  id,
  name: id,
  kind: 'image',
  visible: true,
  locked: false,
  opacity: 100,
  blendMode: 'source-over',
  ...(groupId ? { groupId } : {}),
});
it('places separated members together at the group’s foremost position without mutating stack data', () => {
  const layers = [layer('Beam', 'brand'), layer('Captures'), layer('Logo', 'brand')];
  const grouped = screenshotCompositionGroups(layers);
  expect(grouped.map((group) => group.key)).toEqual(['group:brand', 'layer:Captures']);
  expect(grouped[0]!.layers).toEqual([layers[0], layers[2]]);
  expect(layers.map((item) => item.id)).toEqual(['Beam', 'Captures', 'Logo']);
  expect(grouped[0]!.layers[0]).toBe(layers[0]);
});
it('keeps several groups independent and retains each member’s relative order and visibility', () => {
  const layers = [
    layer('a', 'first'),
    layer('b', 'second'),
    layer('c', 'first'),
    { ...layer('d', 'second'), visible: false },
  ];
  expect(screenshotCompositionGroups(layers).map((group) => group.layers.map((layer) => layer.id))).toEqual([
    ['a', 'c'],
    ['b', 'd'],
  ]);
  expect(screenshotCompositionGroups(layers)[1]!.layers[1]!.visible).toBe(false);
});
it('handles empty lists, standalone members and distinct layer and group identities', () => {
  expect(screenshotCompositionGroups([])).toEqual([]);
  const layers = [layer('same'), layer('member', 'same')];
  expect(screenshotCompositionGroups(layers).map((group) => group.key)).toEqual(['layer:same', 'group:same']);
});
