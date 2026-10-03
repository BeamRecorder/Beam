import { expect, it } from 'vitest';
import { scenePaintOrder } from '../scene-order';
import { colorClip, group, sceneDocument } from './scene-fixtures';
it('preserves legacy order when no graph is authored', () => {
  const doc = sceneDocument();
  delete doc.scene;
  expect(scenePaintOrder(doc)).toBeNull();
});
it('uses nested child order ahead of flat stacking numbers', () => {
  const doc = sceneDocument();
  doc.clips.push(colorClip('b', 0, -1));
  doc.scene!.groups = [group('inner', ['b', 'a']), group('g', ['inner'])];
  expect([...scenePaintOrder(doc)!]).toEqual([
    ['b', 0],
    ['a', 1],
  ]);
});
it('appends ungrouped clips in the same order as the renderer', () => {
  const doc = sceneDocument();
  doc.clips.push(colorClip('b', 0, 1), colorClip('c', 0, 2));
  expect([...scenePaintOrder(doc)!]).toEqual([
    ['a', 0],
    ['c', 1],
    ['b', 2],
  ]);
});
