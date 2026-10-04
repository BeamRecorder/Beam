// @vitest-environment node
import { expect, it } from 'vitest';
import { setClipRotation } from './clip-rotation';
import { createComposition, setCrop, setTransform, validateComposition } from './clip-engine';
import { createStillDocument } from '../screenshot/still-document';
import { createAuthoringSession } from '../document/authoring-session';
import { createRenderDocument } from '../document/render-document';
import { applyCaptionSelectionUpdate } from '../composition/caption-selection';
import { createDefaultCaptionStyle } from '../shared/composition-defaults';
import type { CaptionClip, VisualClip } from '../shared/composition-types';

const composition = () =>
  createComposition(
    [
      {
        id: 'image',
        kind: 'image',
        name: 'Picture',
        fileName: 'source.png',
        durationMs: 1000,
        width: 64,
        height: 32,
        src: 'source.png',
        origin: 'project',
      },
    ],
    [
      {
        ...createStillDocument('picture', 'source.png', 64, 32).state.image,
        trackId: 'image',
        assetId: 'image',
        timelineDurationMs: 1000,
        sourceDurationMs: 1000,
      },
    ],
  );
it('edits the media through structural composition updates and preserves other fields', () => {
  const initial = composition();
  const result = setClipRotation(initial, 'image', -90);
  expect(result.clips[0]).toMatchObject({ rotation: 270, transform: (initial.clips[0] as VisualClip).transform });
  expect((initial.clips[0] as VisualClip).rotation).toBeUndefined();
  expect(result.assets[0]).toBe(initial.assets[0]);
  expect((setCrop(result, 'image', { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }).clips[0] as VisualClip).rotation).toBe(
    270,
  );
  expect(
    (setTransform(result, 'image', { x: 0.2, y: 0.1, width: 0.4, height: 0.5 }).clips[0] as VisualClip).rotation,
  ).toBe(270);
});
it('rejects bad angles, missing clips and unsupported media without mutating the input', () => {
  const initial = composition();
  for (const angle of [NaN, Infinity, -Infinity]) expect(() => setClipRotation(initial, 'image', angle)).toThrow();
  expect(() => setClipRotation(initial, 'missing', 90)).toThrow();
  const invalid = { ...initial, clips: [{ ...initial.clips[0], kind: 'audio' }] } as unknown as typeof initial;
  expect(() => setClipRotation(invalid, 'image', 90)).toThrow('Only media');
  expect((initial.clips[0] as VisualClip).rotation).toBeUndefined();
});
it.each([NaN, Infinity, '90', null])('validates untrusted media rotation %s', (rotation) => {
  const initial = composition();
  expect(() => validateComposition({ ...initial, clips: [{ ...initial.clips[0], rotation } as VisualClip] })).toThrow(
    'rotation',
  );
});
it('authors video rotation using the existing JSON command, history and document protocol', async () => {
  const engine = createAuthoringSession(createRenderDocument(composition(), 64, 32, 30));
  const initial = engine.document;
  engine.execute(JSON.parse('{"type":"clip.patch","payload":{"clipId":"image","patch":{"rotation":90}}}'));
  expect((engine.document.composition.clips[0] as VisualClip).rotation).toBe(90);
  expect(JSON.parse(JSON.stringify(engine.document)).composition.clips[0].rotation).toBe(90);
  await engine.undo();
  expect(engine.document).toBe(initial);
  await engine.redo();
  expect((engine.document.composition.clips[0] as VisualClip).rotation).toBe(90);
});
it('authors still rotation through the same core while preserving immutable undo/redo', async () => {
  const engine = createAuthoringSession(createStillDocument('picture', 'source.png', 64, 32));
  const initial = engine.document;
  engine.execute({
    type: 'still.layer.patch',
    payload: { layerId: 'image', patch: { rotation: 270, isMirrored: true } },
  });
  expect(engine.document.state.image).toMatchObject({ rotation: 270, isMirrored: true });
  await engine.undo();
  expect(engine.document).toBe(initial);
  await engine.redo();
  expect(engine.document.state.image.rotation).toBe(270);
});
it('rejects malformed still rotations atomically without a revision or history entry', () => {
  const engine = createAuthoringSession(createStillDocument('picture', 'source.png', 64, 32));
  const initial = engine.document;
  for (const rotation of ['90', null, Infinity])
    expect(() =>
      engine.execute({ type: 'still.layer.patch', payload: { layerId: 'image', patch: { rotation } } }),
    ).toThrow();
  expect(engine.document).toBe(initial);
  expect(engine.revision).toBe(0);
});

it('rotates text captions through the same engine operation without disturbing their content', () => {
  const clip = {
    id: 'caption',
    kind: 'caption',
    name: 'Text',
    timelineStartMs: 0,
    timelineDurationMs: 1000,
    sourceInMs: 0,
    sourceDurationMs: 1000,
    playbackRate: 1,
    enabled: true,
    order: 0,
    transitions: { entry: null, exit: null },
    caption: { type: 'text', sentences: [], style: createDefaultCaptionStyle(36) },
  } as CaptionClip;
  const source = createComposition([], [clip]);
  const result = setClipRotation(source, clip.id, 32.75);
  expect(result.clips[0]).toMatchObject({ rotation: 32.75, caption: clip.caption });
  expect(clip.rotation).toBeUndefined();
  expect(() => validateComposition({ ...source, clips: [{ ...clip, rotation: Infinity }] })).toThrow('rotation');
});
it('shares a caption rotation edit across its logical layer and keeps unrelated text intact', () => {
  const a = {
    id: 'a',
    kind: 'caption',
    name: 'Text',
    captionLayerId: 'text',
    timelineStartMs: 0,
    timelineDurationMs: 1000,
    sourceInMs: 0,
    sourceDurationMs: 1000,
    playbackRate: 1,
    enabled: true,
    order: 0,
    transitions: { entry: null, exit: null },
    caption: { type: 'text', sentences: [], style: createDefaultCaptionStyle(36) },
  } as CaptionClip;
  const b = { ...a, id: 'b', timelineStartMs: 1000 },
    c = { ...a, id: 'c', captionLayerId: 'other', order: 1 };
  const result = applyCaptionSelectionUpdate(createComposition([], [a, b, c]), ['a'], { ...a, rotation: 42.5 });
  expect(result.clips.find((clip) => clip.id === 'b')).toMatchObject({ rotation: 42.5 });
  expect((result.clips.find((clip) => clip.id === 'c') as CaptionClip).rotation).toBeUndefined();
});
