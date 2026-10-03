// @vitest-environment node
import { expect, it } from 'vitest';
import { createAuthoringSession } from '../document/authoring-session';
import { createStillDocument, validateStillDocument } from './still-document';
import type { StillDocument } from './still-document-types';
import { colorClip } from '../scene/tests/scene-fixtures';
import { createManualZoom } from '../zoom/manual-zoom';
import { createGlassHighlight } from '../zoom/glass-highlight';
const source = () => createStillDocument('picture', 'source.png', 64, 64);
const cursor = () => ({
  id: 'cursor',
  kind: 'cursor',
  name: 'Pointer',
  enabled: true,
  position: { x: 0.5, y: 0.5 },
  size: 32,
  rotation: 0,
  color: '#ffffff',
  selection: { mode: 'fixed', cursorId: 'arrow', packId: 'pack' },
  shadowEnabled: false,
  shadowBlur: 10,
  shadowColor: '#000000',
  shadowDirection: 'all',
});
const effect = () => ({
  ...colorClip('effect'),
  kind: 'blur',
  shape: 'rectangle',
  mode: 'blur',
  strength: 20,
  feather: 0,
  cornerRadius: 0,
  tintOpacity: 0,
  color: '#000000',
});
const image = () => ({ ...source().state.image, id: 'second-image', source: 'other.png', width: 64, height: 64 });
const lens = () => ({
  ...createManualZoom('lens', 0, 1),
  kind: 'zoom',
  name: 'Detail',
  enabled: true,
  effect: 'glass',
  depth: 4,
  glass: createGlassHighlight(),
});
it('authors a static lens with the shared JSON commands, structural sharing and undo/redo', async () => {
  const session = createAuthoringSession(source());
  session.execute({ type: 'still.layer.add', payload: JSON.parse(JSON.stringify(lens())) });
  const before = session.document;
  session.execute({
    type: 'still.layer.patch',
    payload: { layerId: 'lens', patch: { glass: { ...createGlassHighlight(), size: 0.8 } } },
  });
  expect(session.document.state.zooms![0]!.glass!.size).toBe(0.8);
  expect(session.document.state.image).toBe(before.state.image);
  expect(session.document.state.composition!.at(-1)!.id).toBe('lens');
  await session.undo();
  expect(session.document.state.zooms![0]!.glass!.size).toBe(0.6);
  await session.redo();
  expect(session.document.state.zooms![0]!.glass!.size).toBe(0.8);
  session.execute({ type: 'still.layer.delete', payload: { layerId: 'lens' } });
  expect(session.document.state.zooms).toEqual([]);
});
it('rejects animated, malformed and duplicate lenses atomically through JSON authoring', () => {
  const session = createAuthoringSession(source());
  session.execute({ type: 'still.layer.add', payload: lens() });
  const before = session.document,
    revision = session.revision;
  for (const patch of [
    { mode: 'auto' },
    { startMs: 99 },
    { endMs: 2 },
    { animations: {} },
    { keyframes: [] },
    { transitions: [] },
    { effect: 'unknown' },
    { glass: { ...createGlassHighlight(), size: 0 } },
  ]) {
    expect(() => session.execute({ type: 'still.layer.patch', payload: { layerId: 'lens', patch } })).toThrow();
    expect(session.document).toBe(before);
    expect(session.revision).toBe(revision);
  }
  expect(() => session.execute({ type: 'still.layer.add', payload: lens() })).toThrow();
});
it('retains a lens through visibility, ordering and compositing commands', () => {
  const session = createAuthoringSession(source());
  session.execute({ type: 'still.layer.add', payload: lens() });
  session.execute({ type: 'still.layer.enable', payload: { layerId: 'lens', enabled: false } });
  expect(session.document.state.zooms![0]!.enabled).toBe(false);
  session.execute({ type: 'still.layer.reorder', payload: { layerId: 'lens', index: 0 } });
  expect(session.document.state.composition!.at(-1)!.id).toBe('lens');
  session.execute({
    type: 'still.layer.compositing',
    payload: { layerId: 'lens', patch: { opacity: 50, locked: true } },
  });
  expect(session.document.state.composition!.at(-1)).toMatchObject({ id: 'lens', opacity: 50, locked: true });
});
it('authors additional images, effect clips and static cursors with independent ownership', () => {
  const session = createAuthoringSession(source());
  session.transaction([image(), effect(), cursor()].map((payload) => ({ type: 'still.layer.add', payload })));
  const before = session.document;
  session.execute({ type: 'still.layer.patch', payload: { layerId: 'second-image', patch: { isMirrored: true } } });
  expect(session.document.state.images?.[0]?.isMirrored).toBe(true);
  expect(session.document.state.cursors?.[0]).toBe(before.state.cursors?.[0]);
  expect(session.document.state.effects?.[0]).toBe(before.state.effects?.[0]);
  session.execute({ type: 'still.layer.enable', payload: { layerId: 'cursor', enabled: false } });
  expect(session.document.state.cursors?.[0]?.enabled).toBe(false);
  session.execute({ type: 'still.layer.patch', payload: { layerId: 'effect', patch: { strength: 30 } } });
  expect(session.document.state.effects?.[0]?.strength).toBe(30);
});
it('rejects unknown layers, kinds, identity changes and non-boolean visibility without committing', () => {
  const session = createAuthoringSession(source());
  for (const command of [
    { type: 'still.layer.add', payload: { id: '', kind: 'image' } },
    { type: 'still.layer.add', payload: { id: 'video', kind: 'video' } },
    { type: 'still.layer.patch', payload: { layerId: 'image', patch: { id: 'changed' } } },
    { type: 'still.layer.patch', payload: { layerId: '__background__', patch: { rotation: 1 } } },
    { type: 'still.layer.delete', payload: { layerId: '' } },
    { type: 'still.layer.reorder', payload: { layerId: 'image', index: 0.5 } },
    { type: 'still.layer.enable', payload: { layerId: 'image', enabled: 'yes' } },
    { type: 'still.layer.compositing', payload: { layerId: 'image', patch: { extra: 1 } } },
  ])
    expect(() => session.execute(command)).toThrow();
  expect(session.revision).toBe(0);
});
it('validates layer resources, static-only content, compositing and document envelopes', () => {
  const validate = (value: unknown) => validateStillDocument(value as StillDocument);
  const document = source();
  for (const patch of [{ version: 2 }, { kind: 'video' }, { id: '' }, { source: '' }, { width: 0 }])
    expect(() => validate({ ...document, ...patch })).toThrow();
  for (const patch of [
    { format: 'jpeg' },
    { quality: -1 },
    { quality: 2 },
    { blurPercent: -1 },
    { blurPercent: 101 },
    { shapes: null },
    { image: { ...document.state.image, kind: 'video' } },
    { images: [{ ...image(), source: '' }] },
    { images: [{ ...image(), width: 0 }] },
    { image: { ...document.state.image, keyframes: [] } },
    { image: { ...document.state.image, id: '__background__' } },
    { composition: [...document.state.composition!, document.state.composition![0]] },
    { composition: [{ id: 'unknown', opacity: 100, locked: false, blendMode: 'source-over' }] },
    { composition: [{ ...document.state.composition![0], opacity: -1 }] },
    { composition: [{ ...document.state.composition![0], opacity: 101 }] },
    { composition: [{ ...document.state.composition![0], blendMode: 'invalid' }] },
    { composition: [{ ...document.state.composition![0], locked: 'yes' }] },
  ])
    expect(() => validate({ ...document, state: { ...document.state, ...patch } })).toThrow();
  const session = createAuthoringSession(source());
  session.execute({ type: 'still.layer.add', payload: cursor() });
  for (const patch of [
    { id: '' },
    { id: 'image' },
    { enabled: 'yes' },
    { color: null },
    { shadowEnabled: 1 },
    { shadowColor: null },
    { shadowDirection: 'up' },
    { size: 0 },
    { shadowBlur: -1 },
    { selection: { mode: 'recorded' } },
    { selection: { mode: 'fixed', cursorId: '' } },
    { rotation: Number.NaN },
    { keyframes: [] },
  ])
    expect(() =>
      validate({ ...session.document, state: { ...session.document.state, cursors: [{ ...cursor(), ...patch }] } }),
    ).toThrow();
  const old = source();
  delete old.state.composition;
  delete old.state.cursors;
  validate(old);
});
