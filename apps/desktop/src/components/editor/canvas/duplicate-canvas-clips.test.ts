import { createDefaultCaptionStyle, createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import { describe, expect, it } from 'vitest';
import { duplicateCanvasClips } from './duplicate-canvas-clips';
import { screenshotShape } from '~/components/screenshot/screenshot-state';
import { COMPOSITION_SCHEMA_VERSION, type ClipComposition } from '@beam/engine/shared/composition-types';
const fixture = (): ClipComposition => ({
  schemaVersion: COMPOSITION_SCHEMA_VERSION,
  assets: [],
  keyboardCaptionSessions: [],
  clips: [
    {
      ...screenshotShape('rectangle', 'one'),
      assetId: '',
      trackId: 'one-track',
      transitions: { entry: null, exit: null },
      timelineStartMs: 1000,
      timelineDurationMs: 4000,
      sourceDurationMs: 4000,
    },
    {
      ...screenshotShape('ellipse', 'two'),
      assetId: '',
      trackId: 'two-track',
      order: 1,
      transitions: { entry: null, exit: null },
      timelineStartMs: 2000,
      timelineDurationMs: 2000,
      sourceDurationMs: 2000,
    },
  ],
});
const transform = { x: 0.2, y: 0.3, width: 0.4, height: 0.5 };
describe('duplicate canvas layers in the video editor', () => {
  it('duplicates a real selection with new transforms, layers and IDs while preserving original timing', () => {
    const original = fixture(),
      before = structuredClone(original);
    let id = 0;
    const result = duplicateCanvasClips(
      original,
      [
        { id: 'one', transform },
        { id: 'two', transform: { ...transform, x: 0.7 } },
      ],
      () => `copy-${++id}`,
    );
    expect(original).toEqual(before);
    expect(result.ids).toHaveLength(2);
    expect(result.composition.clips).toHaveLength(4);
    expect(result.composition.clips.find((clip) => clip.id === result.ids[0])).toMatchObject({
      timelineStartMs: 1000,
      timelineDurationMs: 4000,
      transform,
    });
    expect(result.composition.clips.find((clip) => clip.id === result.ids[1])).toMatchObject({
      timelineStartMs: 2000,
      transform: { ...transform, x: 0.7 },
    });
  });
  it('does nothing for empty, missing and locked selections', () => {
    const original = fixture();
    original.clips[0]!.locked = true;
    for (const transforms of [[], [{ id: 'missing', transform }], [{ id: 'one', transform }]])
      expect(duplicateCanvasClips(original, transforms)).toEqual({ composition: original, ids: [] });
  });
  it('rejects duplicate IDs atomically', () => {
    const original = fixture(),
      before = structuredClone(original);
    expect(() => duplicateCanvasClips(original, [{ id: 'one', transform }], () => 'one')).toThrow();
    expect(original).toEqual(before);
  });
});

it('duplicates media and text together using their real assets while excluding audio', () => {
  const original = fixture();
  const base = {
    timelineStartMs: 0,
    timelineDurationMs: 4000,
    sourceInMs: 0,
    sourceDurationMs: 4000,
    playbackRate: 1,
    enabled: true,
    transitions: { entry: null, exit: null },
  };
  original.assets = [
    {
      id: 'image-asset',
      kind: 'image',
      name: 'Image',
      fileName: 'image.png',
      src: 'project-media://image.png',
      origin: 'project',
      width: 1200,
      height: 800,
      durationMs: 4000,
    },
  ];
  original.assets.push({
    id: 'audio-asset',
    kind: 'audio',
    name: 'Audio',
    fileName: 'audio.wav',
    src: 'project-media://audio.wav',
    origin: 'project',
    width: null,
    height: null,
    durationMs: 4000,
  });
  original.clips = [
    {
      ...base,
      id: 'image',
      kind: 'image',
      name: 'Image',
      order: 0,
      trackId: 'image-track',
      assetId: 'image-asset',
      transform,
      appearance: createDefaultClipAppearance('image'),
      isMirrored: false,
      isMirroredY: false,
    },
    {
      ...base,
      id: 'text',
      kind: 'caption',
      name: 'Caption',
      order: 1,
      captionLayerId: 'caption-track',
      transform,
      caption: { type: 'text', sentences: [], style: { ...createDefaultCaptionStyle(), customText: 'Caption' } },
    },
    {
      ...base,
      id: 'audio',
      kind: 'audio',
      name: 'Audio',
      order: 2,
      assetId: 'audio-asset',
      role: 'imported',
      volume: 1,
    },
  ];
  let id = 0;
  const result = duplicateCanvasClips(
    original,
    [
      { id: 'image', transform },
      { id: 'text', transform },
      { id: 'audio', transform },
    ],
    () => `copy-${++id}`,
  );
  expect(result.ids).toHaveLength(2);
  expect(result.composition.assets).toEqual(original.assets);
  expect(result.composition.clips.filter((clip) => clip.kind === 'audio')).toHaveLength(1);
  expect(result.composition.clips.find((clip) => clip.id === result.ids[0])).toMatchObject({
    assetId: 'image-asset',
    transform,
  });
  expect(result.composition.clips.find((clip) => clip.id === result.ids[1])).toMatchObject({
    caption: { style: { customText: 'Caption' } },
    transform,
  });
});
