import { describe, it, expect } from 'vitest';
import { createStillDocument, validateStillDocument } from './still-document';
import { createStillCommands } from './still-commands';
import { insertScreenshotLayer } from './screenshot-layers';
import { groupScreenshotLayers } from './screenshot-groups';
import { rotateScreenshotGroup } from './screenshot-group-rotation';
import { DEFAULT_SHAPE_LAYER_STYLE } from '../shared/shape-layer-style';
import { createElementText } from '../shared/element-text';

const bounds = { x: 0.1, y: 0.2, width: 0.3, height: 0.1 };
function fixture() {
  let document = createStillDocument('rotation', 'source.png', 1920, 1080);
  const registry = createStillCommands();
  for (const [index, id] of ['a', 'b', 'outside'].entries())
    document = registry.execute(document, {
      type: 'still.layer.add',
      payload: {
        ...document.state.image,
        ...DEFAULT_SHAPE_LAYER_STYLE,
        id,
        kind: 'shape',
        assetId: '',
        family: 'text',
        preset: 'text',
        text: createElementText(id),
        transform: { x: 0.1 + index * 0.2, y: 0.2, width: 0.1, height: 0.1 },
        rotation: index * 10,
      },
    });
  return document;
}
describe('shared screenshot rotation', () => {
  it('rotates centers in canvas pixels and preserves typography, dimensions and relative angles', () => {
    const state = fixture().state,
      before = structuredClone(state);
    const next = rotateScreenshotGroup(state, ['a', 'b'], bounds, 90);
    expect(next.shapes[0]!.transform.x).toBeCloseTo(0.2);
    expect(next.shapes[1]!.transform.x).toBeCloseTo(0.2);
    expect(next.shapes[0]!.transform.y).toBeCloseTo(0.2 - 192 / 1080);
    expect(next.shapes[1]!.transform.y).toBeCloseTo(0.2 + 192 / 1080);
    expect(next.shapes.map((layer) => layer.rotation)).toEqual([90, 100, 20]);
    expect(next.shapes[0]!.text).toBe(state.shapes[0]!.text);
    expect(next.shapes[2]).toBe(state.shapes[2]);
    expect(next.image).toBe(state.image);
    expect(state).toEqual(before);
    validateStillDocument({ ...fixture(), state: next });
  });
  it('expands persisted groups including hidden members and leaves their metadata intact', () => {
    const state = groupScreenshotLayers(fixture().state, ['a', 'b'], 'pair');
    state.shapes[1]!.enabled = false;
    state.composition!.find((layer) => layer.id === 'a')!.rotation3d = { x: 18, y: -8, perspective: 1200 };
    const next = rotateScreenshotGroup(state, ['a'], bounds, -450);
    expect(next.shapes.map((layer) => layer.rotation)).toEqual([270, 280, 20]);
    expect(next.composition).toBe(state.composition);
    expect(next.shapes[1]!.enabled).toBe(false);
  });
  it.each([[], ['a'], ['a', 'unknown'], ['a', '__background__']])('rejects invalid selections %j', (ids) => {
    expect(() => rotateScreenshotGroup(fixture().state, ids, bounds, 90)).toThrow('selection');
  });
  it('rejects locked groups and blur regions without changing any member', () => {
    const state = fixture().state,
      before = structuredClone(state);
    state.composition!.find((layer) => layer.id === 'b')!.locked = true;
    expect(() => rotateScreenshotGroup(state, ['a', 'b'], bounds, 90)).toThrow('selection');
    expect(state.shapes).toEqual(before.shapes);
    state.effects = [
      {
        ...state.shapes[0]!,
        id: 'blur',
        kind: 'blur',
        mode: 'blur',
        shape: 'rectangle',
        strength: 60,
        feather: 0,
        tintOpacity: 0,
        color: '#000000',
      },
    ];
    insertScreenshotLayer(state, 'blur');
    expect(() => rotateScreenshotGroup(state, ['a', 'blur'], bounds, 90)).toThrow('selection');
  });
  it.each([0, -1, NaN, Infinity])('rejects degenerate or nonfinite bounds %s', (width) => {
    expect(() => rotateScreenshotGroup(fixture().state, ['a', 'b'], { ...bounds, width }, 90)).toThrow('rotation');
  });
  it('rejects nonfinite angles and heights and keeps full turns unchanged', () => {
    const state = fixture().state;
    expect(() => rotateScreenshotGroup(state, ['a', 'b'], bounds, NaN)).toThrow('rotation');
    expect(() => rotateScreenshotGroup(state, ['a', 'b'], { ...bounds, height: 0 }, 90)).toThrow('rotation');
    expect(rotateScreenshotGroup(state, ['a', 'b'], bounds, 360)).toBe(state);
  });
  it('rotates original and imported images and cursor centers while preserving optional arrays', () => {
    const state = fixture().state;
    state.images = [
      { ...state.image, id: 'extra', kind: 'image', source: 'extra.png', width: 1920, height: 1080 },
      { ...state.image, id: 'unselected-image', kind: 'image', source: 'other.png', width: 1920, height: 1080 },
    ];
    state.cursors = [
      {
        id: 'cursor',
        name: 'Cursor',
        enabled: true,
        position: { x: 0.4, y: 0.3 },
        size: 32,
        rotation: 350,
        selection: { packId: 'builtin', mode: 'fixed', cursorId: 'arrow' },
        color: '#fff',
        shadowEnabled: false,
        shadowBlur: 0,
        shadowColor: '#000',
        shadowDirection: 'bottom',
      },
    ];
    state.cursors.push({ ...state.cursors[0]!, id: 'other-cursor' });
    for (const id of ['extra', 'unselected-image', 'cursor', 'other-cursor']) insertScreenshotLayer(state, id);
    delete state.image.rotation;
    const next = rotateScreenshotGroup(state, ['image', 'extra', 'cursor'], bounds, 90);
    expect(next.image.rotation).toBe(90);
    expect(next.images![0]!.rotation).toBe(90);
    expect(next.images![1]).toBe(state.images[1]);
    expect(next.cursors![0]!.rotation).toBe(80);
    expect(next.cursors![0]!.position.x).toBeCloseTo(0.25 - 54 / 1920);
    expect(next.cursors![0]!.position.y).toBeCloseTo(0.25 + 288 / 1080);
    expect(next.cursors![1]).toBe(state.cursors[1]);
    delete state.images;
    delete state.cursors;
    delete state.composition;
    const legacy = rotateScreenshotGroup(state, ['a', 'b'], bounds, 90);
    expect('images' in legacy).toBe(false);
    expect('cursors' in legacy).toBe(false);
    expect('composition' in legacy).toBe(false);
  });
  it('discovers and validates rotation through the same CLI command registry', () => {
    const registry = createStillCommands(),
      document = fixture();
    expect(registry.types).toContain('still.selection.rotate');
    const next = registry.execute(document, {
      type: 'still.selection.rotate',
      payload: { layerIds: ['a', 'b'], bounds, degrees: 90 },
    });
    expect(next.state.shapes[0]!.rotation).toBe(90);
    validateStillDocument(next);
    for (const payload of [
      { layerIds: ['a', 'b'], bounds, degrees: '90' },
      { layerIds: ['a', 'b'], degrees: 90 },
    ])
      expect(() => registry.execute(document, { type: 'still.selection.rotate', payload })).toThrow();
  });
});
