import { describe, expect, it } from 'vitest';
import { createStillDocument, validateStillDocument } from './still-document';
import { createStillCommands } from './still-commands';
import { DEFAULT_SHAPE_LAYER_STYLE } from '../shared/shape-layer-style';
import { createElementText } from '../shared/element-text';
import {
  expandScreenshotGroups,
  groupScreenshotLayers,
  ungroupScreenshotLayers,
  transformScreenshotGroup,
} from './screenshot-groups';
import { insertScreenshotLayer } from './screenshot-layers';
import { pruneScreenshotGroups } from './screenshot-group-members';
import { validateScreenshotGroups } from './screenshot-group-schema.js';
const fixture = () => {
  let doc = createStillDocument('project', 'source.png', 1920, 1080);
  const registry = createStillCommands();
  for (const [index, id] of ['a', 'b', 'c'].entries())
    doc = registry.execute(doc, {
      type: 'still.layer.add',
      payload: {
        ...doc.state.image,
        ...DEFAULT_SHAPE_LAYER_STYLE,
        id,
        kind: 'shape',
        assetId: '',
        family: 'text',
        preset: 'text',
        text: createElementText(id),
        transform: { x: 0.1 + index * 0.2, y: 0.2, width: 0.1, height: 0.1 },
      },
    });
  return doc;
};
describe('persisted screenshot groups', () => {
  it('groups real layers through the discoverable command, preserving the input and member order', () => {
    const doc = fixture(),
      before = structuredClone(doc),
      registry = createStillCommands();
    const next = registry.execute(doc, {
      type: 'still.selection.group',
      payload: { layerIds: ['a', 'b'], groupId: 'pair' },
    });
    validateStillDocument(next);
    expect(doc).toEqual(before);
    expect(expandScreenshotGroups(next.state, ['a'])).toEqual(['a', 'b']);
    expect(next.state.composition?.map((r) => r.id)).toEqual(doc.state.composition?.map((r) => r.id));
  });
  it('joins whole existing groups and rejects identifier collisions', () => {
    const state = groupScreenshotLayers(fixture().state, ['a', 'b'], 'pair');
    const joined = groupScreenshotLayers(state, ['a', 'c'], 'all');
    expect(expandScreenshotGroups(joined, ['c'])).toEqual(['c', 'a', 'b']);
    expect(() => groupScreenshotLayers(state, ['image', 'c'], 'pair')).toThrow('identifier');
  });
  it.each([[], ['a'], ['unknown', 'a'], ['__background__', 'a']])('rejects invalid selections %j', (ids) =>
    expect(() => groupScreenshotLayers(fixture().state, ids, 'pair')).toThrow(),
  );
  it.each(['', '   ', 'x'.repeat(201)])('rejects an invalid group identifier', (id) =>
    expect(() => groupScreenshotLayers(fixture().state, ['a', 'b'], id)).toThrow(),
  );
  it('does not group or detach locked members', () => {
    const state = groupScreenshotLayers(fixture().state, ['a', 'b'], 'pair');
    state.composition!.find((r) => r.id === 'b')!.locked = true;
    expect(() => groupScreenshotLayers(state, ['a', 'c'], 'next')).toThrow('unlocked');
    expect(() => ungroupScreenshotLayers(state, ['a'])).toThrow('locked');
    expect(() =>
      transformScreenshotGroup(
        state,
        ['a', 'b'],
        { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
        { x: 0.1, y: 0.2, width: 0.6, height: 0.2 },
      ),
    ).toThrow('selection');
  });
  it('detaches only selected groups, removes singleton identities after deletion and validates persistence', () => {
    const state = groupScreenshotLayers(fixture().state, ['a', 'b'], 'pair');
    expect(ungroupScreenshotLayers(state, ['a']).composition?.some((r) => r.groupId)).toBe(false);
    state.composition = state.composition!.filter((r) => r.id !== 'b');
    pruneScreenshotGroups(state);
    expect(state.composition?.some((r) => r.groupId)).toBe(false);
    expect(() =>
      validateScreenshotGroups([{ id: 'a', groupId: 'orphan', opacity: 100, locked: false, blendMode: 'source-over' }]),
    ).toThrow('two');
  });
  it('scales shared bounds and native font sizes without mutating members', () => {
    const state = fixture().state,
      before = structuredClone(state),
      font = state.shapes[0]!.text!.style.fontSize;
    const next = transformScreenshotGroup(
      state,
      ['a', 'b'],
      { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
      { x: 0.2, y: 0.4, width: 0.6, height: 0.2 },
    );
    expect(next.shapes[0]!.transform).toEqual({ x: 0.2, y: 0.4, width: 0.2, height: 0.2 });
    expect(next.shapes[1]!.transform.x).toBeCloseTo(0.6);
    expect(next.shapes[0]!.text!.style.fontSize).toBe(font * 2);
    expect(next.shapes[2]).toBe(state.shapes[2]);
    expect(state).toEqual(before);
  });
  it.each([0, -1, NaN])('rejects degenerate or nonfinite bounds %s', (width) =>
    expect(() =>
      transformScreenshotGroup(
        fixture().state,
        ['a', 'b'],
        { x: 0, y: 0, width, height: 0.1 },
        { x: 0, y: 0, width: 1, height: 1 },
      ),
    ).toThrow('bounds'),
  );
  it('exposes grouping, detaching and group transforms through the same command registry', () => {
    const registry = createStillCommands(),
      grouped = registry.execute(fixture(), {
        type: 'still.selection.group',
        payload: { layerIds: ['a', 'b'], groupId: 'pair' },
      });
    const resized = registry.execute(grouped, {
      type: 'still.selection.transform',
      payload: {
        layerIds: ['a', 'b'],
        from: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
        to: { x: 0.2, y: 0.4, width: 0.6, height: 0.2 },
      },
    });
    const detached = registry.execute(resized, { type: 'still.selection.ungroup', payload: { layerIds: ['a'] } });
    validateStillDocument(detached);
    expect(detached.state.composition?.some((r) => r.groupId)).toBe(false);
    for (const payload of [{}, { layerIds: [] }, { layerIds: [''] }, { layerIds: ['a', 'b'] }])
      expect(() => registry.execute(fixture(), { type: 'still.selection.group', payload })).toThrow();
  });
});

it.each([0.001, 20])('keeps native typography valid when a group scales by %s', (scale) => {
  const doc = fixture();
  const next = transformScreenshotGroup(
    doc.state,
    ['a', 'b'],
    { x: 0, y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: scale, height: scale },
  );
  expect(next.shapes[0]!.text!.style.fontSize).toBe(scale < 1 ? 1 : 256);
});

it('scales every drawable kind and keeps camera, cursor and text limits valid', () => {
  const state = fixture().state;
  state.images = [{ ...state.image, id: 'extra-image', kind: 'image', source: 'extra.png', width: 1920, height: 1080 }];
  state.effects = [
    {
      ...state.shapes[0]!,
      id: 'effect',
      kind: 'blur',
      assetId: '',
      mode: 'blur',
      shape: 'rectangle',
      strength: 60,
      feather: 0,
      tintOpacity: 0,
      color: '#000000',
    },
  ];
  state.cursors = [
    {
      id: 'cursor',
      name: 'Cursor',
      enabled: true,
      position: { x: 0.4, y: 0.5 },
      size: 32,
      rotation: 0,
      selection: { packId: 'builtin', mode: 'fixed', cursorId: 'arrow' },
      color: '#fff',
      shadowEnabled: false,
      shadowBlur: 0,
      shadowColor: '#000',
      shadowDirection: 'bottom',
    },
  ];
  state.composition!.find((r) => r.id === 'a')!.rotation3d = { x: 20, y: 0, perspective: 1200 };
  state.shapes[0]!.text!.padding = 40;
  const ids = ['image', 'extra-image', 'effect', 'cursor', 'a'];
  for (const id of ['extra-image', 'effect', 'cursor']) insertScreenshotLayer(state, id);
  const next = transformScreenshotGroup(
    state,
    ids,
    { x: 0, y: 0, width: 1, height: 1 },
    { x: 0.1, y: 0.1, width: 2, height: 2 },
  );
  expect(next.image.transform.width).toBe(2);
  expect(next.images![0]!.transform.width).toBe(2);
  expect(next.effects![0]!.transform.width).toBeCloseTo(0.2);
  expect(next.cursors![0]!.size).toBe(64);
  expect(next.composition!.find((r) => r.id === 'a')!.rotation3d!.perspective).toBe(2400);
  expect(next.shapes[0]!.text!.padding).toBe(40);
  for (const scale of [0.001, 20]) {
    const scaled = transformScreenshotGroup(
      state,
      ids,
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 0, y: 0, width: scale, height: scale },
    );
    expect(scaled.cursors![0]!.size).toBe(scale < 1 ? 16 : 384);
    expect(scaled.composition!.find((r) => r.id === 'a')!.rotation3d!.perspective).toBe(scale < 1 ? 200 : 10000);
  }
});
it('supports missing optional arrays without adding non-JSON fields', () => {
  const state = fixture().state;
  delete state.composition;
  delete state.cursors;
  expect(ungroupScreenshotLayers(state, [])).toEqual(state);
  pruneScreenshotGroups(state);
  const next = transformScreenshotGroup(
    state,
    ['a'],
    { x: 0, y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: 1, height: 1 },
  );
  expect('composition' in next).toBe(false);
  expect('images' in next).toBe(false);
  expect('effects' in next).toBe(false);
  expect('cursors' in next).toBe(false);
  expect(() =>
    transformScreenshotGroup(state, [], { x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 1, height: 1 }),
  ).toThrow('selection');
});
it('keeps real groups while pruning orphan members and rejects malformed persisted identities', () => {
  const state = groupScreenshotLayers(fixture().state, ['a', 'b'], 'pair');
  pruneScreenshotGroups(state);
  expect(expandScreenshotGroups(state, ['a'])).toEqual(['a', 'b']);
  for (const groupId of [1, '', ' ', 'x'.repeat(201)])
    expect(() => validateScreenshotGroups([{ id: 'a', groupId }])).toThrow('Invalid');
  expect(() =>
    validateScreenshotGroups([
      { id: '__background__', groupId: 'pair' },
      { id: 'a', groupId: 'pair' },
    ]),
  ).toThrow('Invalid');
});

it('groups legacy screenshots without mutating or synthesizing optional fields on the input', () => {
  const state = fixture().state;
  delete state.composition;
  const next = groupScreenshotLayers(state, ['a', 'b'], 'legacy');
  expect(expandScreenshotGroups(next, ['a'])).toEqual(['a', 'b']);
  expect(state.composition).toBeUndefined();
  validateStillDocument({ ...fixture(), state: next });
});
