import { expect, it } from 'vitest';
import { createStillDocument, validateStillDocument } from './still-document';
import { createStillCommands } from './still-commands';
import { DEFAULT_SHAPE_LAYER_STYLE } from '../shared/shape-layer-style';
import { groupScreenshotLayers } from './screenshot-groups';
import { canMoveScreenshotLayersToGroup, moveScreenshotLayersToGroup } from './screenshot-group-transfer';
const fixture = () => {
  let doc = createStillDocument('project', 'source.png', 1920, 1080);
  for (const id of ['a', 'b', 'c', 'd', 'e'])
    doc = createStillCommands().execute(doc, {
      type: 'still.layer.add',
      payload: { ...doc.state.image, ...DEFAULT_SHAPE_LAYER_STYLE, id, kind: 'shape', assetId: '' },
    });
  doc.state = groupScreenshotLayers(groupScreenshotLayers(doc.state, ['a', 'b'], 'source'), ['c', 'd'], 'target');
  return doc;
};
it('moves one member into an exact group slot, dissolves a source singleton and preserves artwork', () => {
  const doc = fixture(),
    before = structuredClone(doc),
    next = moveScreenshotLayersToGroup(doc.state, ['a'], 'target', 2);
  validateStillDocument({ ...doc, state: next });
  expect(doc).toEqual(before);
  expect(next.shapes).toBe(doc.state.shapes);
  expect(next.canvas).toBe(doc.state.canvas);
  const front = [...next.composition!].reverse();
  expect(front[2]?.id).toBe('a');
  expect(front.find((layer) => layer.id === 'a')?.groupId).toBe('target');
  expect(front.find((layer) => layer.id === 'b')?.groupId).toBeUndefined();
  expect(front.filter((layer) => layer.groupId === 'target')).toHaveLength(3);
});
it('reorders existing members and detaches explicit members without expanding their group', () => {
  const doc = fixture(),
    moved = moveScreenshotLayersToGroup(doc.state, ['a'], 'source', 0);
  expect(moved.composition?.at(-1)?.id).toBe('a');
  const detached = moveScreenshotLayersToGroup(moved, ['a'], null, 2);
  expect(detached.composition?.find((layer) => layer.id === 'a')?.groupId).toBeUndefined();
  expect(detached.composition?.find((layer) => layer.id === 'b')?.groupId).toBeUndefined();
  expect(detached.composition?.filter((layer) => layer.groupId === 'target')).toHaveLength(2);
  validateStillDocument({ ...doc, state: detached });
});
it('supports multi-member insertion, duplicate selection IDs and optional stacking indexes', () => {
  const doc = fixture(),
    next = moveScreenshotLayersToGroup(doc.state, ['a', 'b', 'a'], 'target', 1);
  expect(
    [...next.composition!]
      .reverse()
      .slice(1, 3)
      .map((layer) => layer.id),
  ).toEqual(['b', 'a']);
  const unchangedOrder = moveScreenshotLayersToGroup(doc.state, ['e'], 'target');
  expect(unchangedOrder.composition?.map((layer) => layer.id)).toEqual(doc.state.composition?.map((layer) => layer.id));
  const noComposition = { ...doc.state, composition: undefined };
  expect(moveScreenshotLayersToGroup(noComposition, ['a'], null).composition).toBeDefined();
});
it.each(
  [[], ['unknown'], ['__background__'], ['__watermark__'], Array.from({ length: 501 }, (_, i) => `missing-${i}`)].map(
    (ids) => ({ ids }),
  ),
)('rejects ineligible members $ids', ({ ids }) => {
  expect(canMoveScreenshotLayersToGroup(fixture().state, ids, 'target')).toBe(false);
  expect(() => moveScreenshotLayersToGroup(fixture().state, ids, 'target')).toThrow('Cannot');
});
it.each(['absent', '', 'source-singleton'])('requires a real target group: %s', (groupId) => {
  expect(canMoveScreenshotLayersToGroup(fixture().state, ['e'], groupId)).toBe(false);
});
it.each(['a', 'b', 'c', 'd'])('preserves locked source and destination groups: %s', (id) => {
  const doc = fixture();
  doc.state.composition!.find((layer) => layer.id === id)!.locked = true;
  expect(canMoveScreenshotLayersToGroup(doc.state, ['a'], 'target')).toBe(false);
});
it.each([-1, 1.5, NaN, Infinity, 100])('rejects invalid insertion indexes %s', (index) => {
  expect(() => moveScreenshotLayersToGroup(fixture().state, ['a'], 'target', index)).toThrow('index');
});
it('exposes the same group move through agent commands with bounded payload validation', () => {
  const doc = fixture(),
    registry = createStillCommands();
  const next = registry.execute(doc, {
    type: 'still.selection.move-to-group',
    payload: { layerIds: ['e'], groupId: 'target', frontIndex: 0 },
  });
  validateStillDocument(next);
  expect(next.state.composition?.at(-1)).toMatchObject({ id: 'e', groupId: 'target' });
  const detached = registry.execute(next, {
    type: 'still.selection.move-to-group',
    payload: { layerIds: ['e'], groupId: null },
  });
  expect(detached.state.composition?.at(-1)?.groupId).toBeUndefined();
  for (const payload of [
    { layerIds: ['e'] },
    { layerIds: ['e'], groupId: 4 },
    { layerIds: ['e'], groupId: 'target', frontIndex: '0' },
  ])
    expect(() => registry.execute(doc, { type: 'still.selection.move-to-group', payload })).toThrow();
});
