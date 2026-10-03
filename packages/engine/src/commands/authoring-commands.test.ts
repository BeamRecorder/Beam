// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createDocumentSession } from '../document/document-session';
import { createCompositionCommands } from './composition-commands';
import { validateComposition } from './clip-composition-validation';
import { emptyComposition } from '../shared/composition-types';
import { colorClip } from '../scene/tests/scene-fixtures';
const session = () =>
  createDocumentSession(emptyComposition(), { commands: createCompositionCommands(), validate: validateComposition });
describe('programmatic composition authoring', () => {
  it('creates assets and clips and patches one record with shared history', async () => {
    const engine = session();
    engine.execute({
      type: 'asset.add',
      payload: {
        id: 'asset',
        kind: 'image',
        name: 'Image',
        src: 'image.png',
        fileName: null,
        durationMs: 0,
        width: 10,
        height: 10,
        origin: 'project',
      },
    });
    engine.execute({ type: 'clip.add', payload: colorClip() });
    const before = engine.document;
    engine.execute({
      type: 'clip.patch',
      payload: { clipId: 'a', patch: { name: 'Renamed', transform: { x: 0.2, y: 0, width: 1, height: 1 } } },
    });
    expect(engine.document.assets).toBe(before.assets);
    expect(engine.document.clips[0]?.name).toBe('Renamed');
    await engine.undo();
    expect(engine.document).toBe(before);
    engine.execute({ type: 'asset.remove', payload: { assetId: 'asset' } });
    expect(engine.document.assets).toHaveLength(0);
  });
  it('rejects duplicate identities and invalid patches atomically', () => {
    const engine = session();
    engine.execute({ type: 'clip.add', payload: colorClip() });
    for (const command of [
      { type: 'clip.add', payload: colorClip() },
      { type: 'clip.patch', payload: { clipId: 'a', patch: { id: 'other' } } },
      { type: 'clip.patch', payload: { clipId: 'missing', patch: { name: 'x' } } },
      { type: 'clip.add', payload: { id: 'invalid' } },
      { type: 'asset.add', payload: {} },
      { type: 'asset.remove', payload: { assetId: 'missing' } },
    ])
      expect(() => engine.execute(command)).toThrow();
    expect(engine.revision).toBe(1);
  });
  it('preserves locked content and rejects removing assets still referenced by clips', () => {
    const commands = createCompositionCommands(),
      engine = session();
    engine.execute({ type: 'clip.add', payload: { ...colorClip(), locked: true } });
    expect(() => engine.execute({ type: 'clip.patch', payload: { clipId: 'a', patch: { name: 'Changed' } } })).toThrow(
      'locked',
    );
    const document = { ...emptyComposition(), clips: [{ ...colorClip(), assetId: 'used' }] };
    expect(() => commands.execute(document, { type: 'asset.remove', payload: { assetId: 'used' } })).toThrow(
      'still used',
    );
  });
});
it('rejects malformed asset metadata and patch envelopes', () => {
  const engine = session();
  engine.execute({ type: 'clip.add', payload: colorClip() });
  for (const command of [
    { type: 'asset.remove', payload: { assetId: 1 } },
    {
      type: 'asset.add',
      payload: {
        id: 'asset',
        name: 'Image',
        src: 'image.png',
        fileName: null,
        width: -1,
        height: 1,
        origin: 'project',
      },
    },
    { type: 'clip.patch', payload: { clipId: 1, patch: {} } },
    { type: 'clip.patch', payload: { clipId: 'a', patch: { name: 1 } } },
    { type: 'clip.patch', payload: { clipId: 'a', patch: { enabled: 'yes' } } },
  ])
    expect(() => engine.execute(command)).toThrow();
  engine.execute({
    type: 'asset.add',
    payload: {
      id: 'asset',
      kind: 'image',
      name: 'Image',
      src: 'image.png',
      fileName: null,
      durationMs: 0,
      width: null,
      height: null,
      origin: 'project',
    },
  });
  expect(() => engine.execute({ type: 'asset.add', payload: engine.document.assets[0] })).toThrow('exists');
});
