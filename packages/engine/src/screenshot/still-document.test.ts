// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createStillDocument, validateStillDocument } from './still-document';
import { createStillCommands } from './still-commands';
import { createDocumentSession } from '../document/document-session';
import { DEFAULT_SHAPE_LAYER_STYLE } from '../shared/shape-layer-style';
import { colorClip } from '../scene/tests/scene-fixtures';
const shape = () => ({ ...colorClip('shape'), ...DEFAULT_SHAPE_LAYER_STYLE, kind: 'shape', assetId: '' });
describe('shared still documents', () => {
  it('uses visual clip data and owns immutable history for shapes, blur and image layers', async () => {
    const input = createStillDocument('picture', 'source.png', 64, 64);
    const engine = createDocumentSession(input, { commands: createStillCommands(), validate: validateStillDocument });
    engine.execute({ type: 'still.layer.add', payload: shape() });
    expect(engine.document.state.shapes[0]?.id).toBe('shape');
    const before = engine.document;
    engine.execute({ type: 'still.layer.patch', payload: { layerId: 'shape', patch: { rotation: 25 } } });
    expect(engine.document.state.shapes[0]?.rotation).toBe(25);
    expect(before.state.shapes[0]?.rotation).toBe(0);
    await engine.undo();
    expect(engine.document).toBe(before);
  });
  it('edits the same layer visibility/order/canvas operations used by the desktop', () => {
    const engine = createDocumentSession(createStillDocument('picture', 'source.png', 64, 64), {
      commands: createStillCommands(),
      validate: validateStillDocument,
    });
    engine.transaction([
      { type: 'still.layer.add', payload: shape() },
      { type: 'still.layer.enable', payload: { layerId: 'shape', enabled: false } },
      { type: 'still.layer.reorder', payload: { layerId: 'shape', index: 2 } },
      { type: 'still.canvas.set', payload: { ...engine.document.state.canvas, width: 128 } },
      { type: 'still.background.set', payload: { kind: 'color', color: '#123456' } },
    ]);
    expect(engine.document.state.canvas.width).toBe(128);
    expect(engine.document.state.shapes[0]?.enabled).toBe(false);
    engine.execute({ type: 'still.layer.delete', payload: { layerId: 'shape' } });
    expect(engine.document.state.shapes).toHaveLength(0);
  });
  it('rejects animations, malformed geometry, duplicate layers and locked edits', () => {
    expect(() => createStillDocument('picture', 'image', -1, 64)).toThrow();
    const input = createStillDocument('picture', 'source.png', 64, 64);
    input.state.composition!.find((layer) => layer.id === 'image')!.locked = true;
    const engine = createDocumentSession(input, { commands: createStillCommands(), validate: validateStillDocument });
    for (const command of [
      { type: 'still.layer.patch', payload: { layerId: 'image', patch: { rotation: 1 } } },
      { type: 'still.layer.patch', payload: { layerId: 'image', patch: { timelineDurationMs: 100 } } },
      { type: 'still.layer.add', payload: { ...shape(), id: 'image' } },
      { type: 'still.layer.delete', payload: { layerId: 'missing' } },
      { type: 'still.canvas.set', payload: { ...input.state.canvas, width: 0 } },
    ])
      expect(() => engine.execute(command)).toThrow();
    expect(engine.revision).toBe(0);
  });
});
it('changes compositing, explicitly unlocks layers and validates export settings', () => {
  const engine = createDocumentSession(createStillDocument('picture', 'source.png', 64, 64), {
    commands: createStillCommands(),
    validate: validateStillDocument,
  });
  engine.execute({
    type: 'still.layer.compositing',
    payload: { layerId: 'image', patch: { locked: true, opacity: 50, blendMode: 'multiply' } },
  });
  expect(engine.document.state.composition?.find((layer) => layer.id === 'image')).toMatchObject({
    opacity: 50,
    locked: true,
  });
  expect(() =>
    engine.execute({ type: 'still.layer.compositing', payload: { layerId: 'image', patch: { opacity: 20 } } }),
  ).toThrow('locked');
  engine.execute({ type: 'still.layer.compositing', payload: { layerId: 'image', patch: { locked: false } } });
  engine.execute({ type: 'still.settings.patch', payload: { format: 'webp', quality: 0.8, blurPercent: 10 } });
  expect(engine.document.state.format).toBe('webp');
  for (const command of [
    { type: 'still.settings.patch', payload: { quality: 2 } },
    { type: 'still.settings.patch', payload: { animations: {} } },
    { type: 'still.layer.compositing', payload: { layerId: 'missing', patch: {} } },
    { type: 'still.layer.compositing', payload: { layerId: 'image', patch: { opacity: -1 } } },
    { type: 'still.layer.compositing', payload: { layerId: 'image', patch: { blendMode: 'invalid' } } },
    { type: 'still.layer.compositing', payload: { layerId: 'image', patch: { locked: 'yes' } } },
  ])
    expect(() => engine.execute(command)).toThrow();
});
