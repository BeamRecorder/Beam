import { describe, it, expect } from 'vitest';
import { createAuthoringSession, createStillDocument } from '../index';
import { screenshotLayers } from './screenshot-layers';
const session = () => createAuthoringSession(createStillDocument('test', 'source.png', 100, 100));
describe('discoverable still layer renaming', () => {
  it.each(['image', '__background__', '__watermark__'])(
    'names %s without replacing content or source identity',
    (id) => {
      const s = session(),
        previous = s.document.state;
      s.execute({ type: 'still.layer.rename', payload: { layerId: id, name: 'Fond · Écorce 🔥' } });
      expect(screenshotLayers(s.document.state).find((layer) => layer.id === id)!.name).toBe('Fond · Écorce 🔥');
      expect(previous.layerNames).toBeUndefined();
      expect(s.document.state.image).toBe(previous.image);
    },
  );
  it.each(['', '   ', ' Name', 'Name ', 'x'.repeat(201), null, 123])(
    'rejects malformed names %# atomically',
    (name) => {
      const s = session(),
        before = s.document;
      expect(() => s.execute({ type: 'still.layer.rename', payload: { layerId: 'image', name } })).toThrow('name');
      expect(s.document).toBe(before);
      expect(s.revision).toBe(0);
    },
  );
  it('rejects missing, locked and unknown targets as well as unrecognized fields', () => {
    const s = session();
    for (const payload of [
      { name: 'Name' },
      { layerId: 'missing', name: 'Name' },
      { layerId: 'image', name: 'Name', extra: true },
    ])
      expect(() => s.execute({ type: 'still.layer.rename', payload })).toThrow();
    s.execute({ type: 'still.layer.compositing', payload: { layerId: 'image', patch: { locked: true } } });
    expect(() => s.execute({ type: 'still.layer.rename', payload: { layerId: 'image', name: 'Name' } })).toThrow(
      'locked',
    );
  });
  it('retains exact names through undo/redo, supports the length boundary and keeps idempotent content', async () => {
    const s = session(),
      name = 'x'.repeat(200);
    s.execute({ type: 'still.layer.rename', payload: { layerId: 'image', name } });
    const renamed = s.document.state.layerNames;
    s.execute({ type: 'still.layer.rename', payload: { layerId: 'image', name } });
    expect(s.document.state.layerNames).toBe(renamed);
    await s.undo();
    await s.undo();
    expect(s.document.state.layerNames).toBeUndefined();
    await s.redo();
    expect(s.document.state.layerNames!.image).toBe(name);
  });
});
