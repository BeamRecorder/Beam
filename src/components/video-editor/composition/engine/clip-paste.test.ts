import { describe, expect, it } from 'vitest';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type {
  AudioClip,
  CaptionClip,
  Clip,
  ClipComposition,
  MediaAsset,
  VisualClip,
} from '~/media/shared/composition-types';
import { CompositionEngineError } from './clip-composition-validation';
import { pasteClipAt } from './clip-paste';

const asset = (id: string, kind: MediaAsset['kind'] = 'video'): MediaAsset => ({
  id,
  kind,
  name: id,
  fileName: `${id}.${kind === 'audio' ? 'wav' : 'mp4'}`,
  durationMs: 4_000,
  width: kind === 'audio' ? null : 1_920,
  height: kind === 'audio' ? null : 1_080,
  src: `${id}.${kind === 'audio' ? 'wav' : 'mp4'}`,
  origin: 'project',
});

const visual = (
  id: string,
  kind: VisualClip['kind'],
  assetId: string,
  timelineStartMs = 0,
  timelineDurationMs = 1_000,
  overrides: Partial<VisualClip> = {},
): VisualClip => ({
  id,
  kind,
  name: id,
  assetId,
  timelineStartMs,
  timelineDurationMs,
  sourceInMs: 0,
  sourceDurationMs: timelineDurationMs,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: kind === 'screen' ? 0 : 1,
  trackId: `${id}-track`,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  crop: undefined,
  appearance: createDefaultClipAppearance(kind === 'webcam' ? 'webcam' : kind),
  isMirrored: false,
  isMirroredY: false,
  ...(kind === 'webcam'
    ? {
        cameraLayoutPreset: 'floating-bottom-right' as const,
        cameraFramingPreset: 'squircle' as const,
        cameraSplitRatio: 0.5,
        cameraSplitPadding: 0,
      }
    : {}),
  ...overrides,
});

const audio = (
  id: string,
  assetId: string,
  timelineStartMs = 0,
  timelineDurationMs = 1_000,
  overrides: Partial<AudioClip> = {},
): AudioClip => ({
  id,
  kind: 'audio',
  name: id,
  assetId,
  role: 'microphone',
  volume: 83,
  timelineStartMs,
  timelineDurationMs,
  sourceInMs: 0,
  sourceDurationMs: timelineDurationMs,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 3,
  ...overrides,
});

const caption = (
  id: string,
  type: 'text' | 'keyboard',
  timelineStartMs = 0,
  timelineDurationMs = 1_000,
  overrides: Partial<CaptionClip> = {},
): CaptionClip => ({
  id,
  kind: 'caption',
  name: id,
  timelineStartMs,
  timelineDurationMs,
  sourceInMs: 0,
  sourceDurationMs: timelineDurationMs,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 4,
  caption:
    type === 'text'
      ? {
          type: 'text',
          sentences: [{ id: `${id}-sentence`, text: id, startMs: 0, endMs: timelineDurationMs, words: [] }],
          style: createDefaultCaptionStyle(),
        }
      : {
          type: 'keyboard',
          steps: [{ offsetMs: 0, modifiers: [], key: 'A' }],
          followCursor: false,
          recordedPlatform: 'linux',
          sourceSessionId: `${id}-session`,
          style: createDefaultCaptionStyle(),
        },
  ...overrides,
});

const composition = (clips: Clip[], assets: MediaAsset[]): ClipComposition => ({
  schemaVersion: 8,
  assets,
  clips,
  keyboardCaptionSessions: [],
});

const ids = (clips: Clip[]) => clips.map(({ id }) => id);

describe('pasteClipAt', () => {
  it('overwrites a visual lane by trimming and splitting, preserving source timing and asset references', () => {
    const target = visual('target', 'video', 'target-asset', 0, 1_200, {
      trackId: 'video-track',
      order: 1,
      sourceInMs: 100,
      sourceDurationMs: 1_200,
    });
    const screen = visual('screen', 'screen', 'screen-asset', 0, 1_200, {
      trackId: 'screen-track',
      order: 0,
    });
    const microphone = audio('microphone', 'microphone-asset', 0, 1_200);
    const copied = visual('copied', 'video', 'copied-asset', 0, 400, {
      trackId: 'source-track',
      order: 5,
      sourceInMs: 240,
      sourceDurationMs: 600,
      playbackRate: 1.5,
      transform: { x: 0.2, y: 0.3, width: 0.4, height: 0.5 },
    });
    const source = composition(
      [target, screen, microphone],
      [asset('target-asset'), asset('screen-asset'), asset('microphone-asset', 'audio'), asset('copied-asset')],
    );

    let nextId = 0;
    const result = pasteClipAt(source, copied, {
      timelineStartMs: 300,
      timelineDurationMs: 2_000,
      targetTrackId: 'video-track',
      idFactory: () => `generated-${++nextId}`,
    });
    const pasted = result.composition.clips.find((clip) => clip.id === result.clipId) as VisualClip;
    const fragments = result.composition.clips
      .filter((clip): clip is VisualClip => clip.trackId === 'video-track')
      .sort((left, right) => left.timelineStartMs - right.timelineStartMs);

    expect(pasted).toMatchObject({
      id: 'generated-1',
      assetId: 'copied-asset',
      timelineStartMs: 300,
      timelineDurationMs: 400,
      sourceInMs: 240,
      sourceDurationMs: 600,
      playbackRate: 1.5,
      trackId: 'video-track',
      transform: copied.transform,
    });
    expect(fragments.map((clip) => [clip.id, clip.timelineStartMs, clip.timelineDurationMs, clip.sourceInMs])).toEqual([
      ['target', 0, 300, 100],
      ['generated-1', 300, 400, 240],
      ['generated-2', 700, 500, 800],
    ]);
    expect(new Set(ids(result.composition.clips)).size).toBe(result.composition.clips.length);
    expect(result.composition.assets.filter(({ id }) => id === 'copied-asset')).toHaveLength(1);
    expect(result.composition.clips.find((clip) => clip.id === 'screen')).toEqual(screen);
    expect(result.composition.clips.find((clip) => clip.id === 'microphone')).toMatchObject({
      ...microphone,
      order: expect.any(Number),
    });
  });

  it('pastes a webcam with its camera settings into the selected webcam track', () => {
    const target = visual('camera-target', 'webcam', 'camera-asset', 0, 1_000, {
      trackId: 'camera-track',
      order: 1,
    });
    const screen = visual('screen', 'screen', 'screen-asset', 0, 1_000, {
      trackId: 'screen-track',
      order: 0,
    });
    const copied = visual('copied-camera', 'webcam', 'camera-asset', 0, 600, {
      trackId: 'copied-track',
      order: 5,
      cameraLayoutPreset: 'split-right',
      cameraFramingPreset: 'circle',
      cameraSplitRatio: 0.7,
      cameraSplitPadding: 0.04,
      transform: { x: 0.3, y: 0, width: 0.7, height: 1 },
    });
    const source = composition([target, screen], [asset('camera-asset'), asset('screen-asset')]);

    let nextId = 0;
    const result = pasteClipAt(source, copied, {
      timelineStartMs: 200,
      timelineDurationMs: 1_500,
      targetTrackId: 'camera-track',
      idFactory: () => (nextId++ === 0 ? 'pasted-camera' : 'pasted-camera-fragment'),
    });
    const pasted = result.composition.clips.find((clip) => clip.id === 'pasted-camera') as VisualClip;

    expect(pasted).toMatchObject({
      kind: 'webcam',
      trackId: 'camera-track',
      cameraLayoutPreset: 'split-right',
      cameraFramingPreset: 'circle',
      cameraSplitRatio: 0.7,
      cameraSplitPadding: 0.04,
      transform: copied.transform,
    });
    expect(
      result.composition.clips
        .filter((clip) => clip.trackId === 'camera-track')
        .map((clip) => [clip.timelineStartMs, clip.timelineDurationMs]),
    ).toEqual([
      [0, 200],
      [200, 600],
      [800, 200],
    ]);
    expect(result.composition.clips.find((clip) => clip.id === 'screen')).toEqual(screen);
    expect(result.composition.assets).toHaveLength(2);
  });

  it('removes a same-lane clip that is fully covered by the pasted clip', () => {
    const covered = visual('covered', 'video', 'covered-asset', 300, 400, {
      trackId: 'video-track',
      order: 1,
    });
    const copied = visual('copied', 'video', 'copied-asset', 0, 1_000, {
      trackId: 'source-track',
      order: 5,
    });
    const source = composition([covered], [asset('covered-asset'), asset('copied-asset')]);

    const result = pasteClipAt(source, copied, {
      timelineStartMs: 0,
      timelineDurationMs: 2_000,
      targetTrackId: 'video-track',
      idFactory: () => 'pasted',
    });

    expect(result.composition.clips.map(({ id }) => id)).toEqual(['pasted']);
    expect(result.composition.clips[0]).toMatchObject({ timelineStartMs: 0, timelineDurationMs: 1_000 });
  });

  it('overwrites only the matching caption type lane', () => {
    const text = caption('text-target', 'text', 0, 1_000);
    const keyboard = caption('keyboard-target', 'keyboard', 0, 1_000);
    const copied = caption('copied-text', 'text', 0, 400);
    const source = composition([text, keyboard], []);

    let nextId = 0;
    const result = pasteClipAt(source, copied, {
      timelineStartMs: 200,
      timelineDurationMs: 1_500,
      idFactory: () => (nextId++ === 0 ? 'pasted-caption' : 'generated-caption'),
    });
    const textClips = result.composition.clips.filter(
      (clip): clip is CaptionClip => clip.kind === 'caption' && clip.caption.type === 'text',
    );

    expect(textClips.map((clip) => [clip.id, clip.timelineStartMs, clip.timelineDurationMs])).toEqual([
      ['text-target', 0, 200],
      ['pasted-caption', 200, 400],
      ['generated-caption', 600, 400],
    ]);
    expect(result.composition.clips.find((clip) => clip.id === 'keyboard-target')).toMatchObject({
      ...keyboard,
      order: expect.any(Number),
    });
    expect(textClips.find((clip) => clip.id === 'pasted-caption')?.caption).toEqual(copied.caption);
  });

  it('keeps unrelated visual tracks, audio, and synchronized groups unchanged', () => {
    const target = visual('target', 'video', 'target-asset', 0, 1_000, {
      trackId: 'video-track',
      order: 1,
    });
    const screen = visual('screen', 'screen', 'screen-asset', 0, 1_000, {
      trackId: 'screen-track',
      order: 0,
      groupId: 'kept-group',
    });
    const overlay = visual('overlay', 'image', 'overlay-asset', 0, 1_000, {
      trackId: 'overlay-track',
      order: 2,
      groupId: 'kept-group',
    });
    const microphone = audio('microphone', 'microphone-asset', 0, 1_000, {
      groupId: 'kept-group',
    });
    const copied = visual('copied', 'video', 'copied-asset', 0, 400, {
      trackId: 'source-track',
      order: 5,
    });
    const source = composition(
      [target, screen, overlay, microphone],
      [
        asset('target-asset'),
        asset('screen-asset'),
        asset('overlay-asset', 'image'),
        asset('microphone-asset', 'audio'),
        asset('copied-asset'),
      ],
    );

    let nextId = 0;
    const result = pasteClipAt(source, copied, {
      timelineStartMs: 300,
      timelineDurationMs: 1_500,
      targetTrackId: 'video-track',
      idFactory: () => (nextId++ === 0 ? 'pasted' : 'pasted-fragment'),
    });

    expect(result.composition.clips.find((clip) => clip.id === 'screen')).toEqual(screen);
    expect(result.composition.clips.find((clip) => clip.id === 'overlay')).toEqual(overlay);
    expect(result.composition.clips.find((clip) => clip.id === 'microphone')).toEqual(microphone);
    expect(result.composition.clips.filter((clip) => clip.groupId === 'kept-group')).toHaveLength(3);
  });

  it('overwrites only the microphone audio lane', () => {
    const existingMicrophone = audio('existing-microphone', 'microphone-existing', 0, 1_000, {
      role: 'microphone',
      order: 1,
    });
    const system = audio('system', 'system-asset', 0, 1_000, { role: 'system', order: 2 });
    const imported = audio('imported', 'imported-asset', 0, 1_000, { role: 'imported', order: 3 });
    const copied = audio('copied-microphone', 'microphone-copy', 0, 400, {
      role: 'microphone',
      order: 5,
    });
    const source = composition(
      [existingMicrophone, system, imported],
      [
        asset('microphone-existing', 'audio'),
        asset('microphone-copy', 'audio'),
        asset('system-asset', 'audio'),
        asset('imported-asset', 'audio'),
      ],
    );

    let nextId = 0;
    const result = pasteClipAt(source, copied, {
      timelineStartMs: 300,
      timelineDurationMs: 1_500,
      idFactory: () => (nextId++ === 0 ? 'pasted-microphone' : 'microphone-fragment'),
    });
    const microphoneClips = result.composition.clips
      .filter((clip): clip is AudioClip => clip.kind === 'audio' && clip.role === 'microphone')
      .sort((left, right) => left.timelineStartMs - right.timelineStartMs);

    expect(microphoneClips.map((clip) => [clip.id, clip.timelineStartMs, clip.timelineDurationMs])).toEqual([
      ['existing-microphone', 0, 300],
      ['pasted-microphone', 300, 400],
      ['microphone-fragment', 700, 300],
    ]);
    expect(result.composition.clips.find((clip) => clip.id === 'system')).toMatchObject({
      ...system,
      order: expect.any(Number),
    });
    expect(result.composition.clips.find((clip) => clip.id === 'imported')).toMatchObject({
      ...imported,
      order: expect.any(Number),
    });
  });

  it('overwrites only fragments from the same imported audio asset', () => {
    const importedBefore = audio('imported-before', 'imported-a', 0, 500, { role: 'imported', order: 1 });
    const importedAfter = audio('imported-after', 'imported-a', 500, 500, { role: 'imported', order: 1 });
    const otherImported = audio('other-imported', 'imported-b', 0, 1_000, { role: 'imported', order: 2 });
    const copied = audio('copied-imported', 'imported-a', 0, 400, { role: 'imported', order: 5 });
    const source = composition(
      [importedBefore, importedAfter, otherImported],
      [asset('imported-a', 'audio'), asset('imported-b', 'audio')],
    );

    let nextId = 0;
    const result = pasteClipAt(source, copied, {
      timelineStartMs: 300,
      timelineDurationMs: 1_500,
      idFactory: () => (nextId++ === 0 ? 'pasted-imported' : 'imported-after-fragment'),
    });
    const matchingAssetClips = result.composition.clips
      .filter(
        (clip): clip is AudioClip => clip.kind === 'audio' && clip.role === 'imported' && clip.assetId === 'imported-a',
      )
      .sort((left, right) => left.timelineStartMs - right.timelineStartMs);

    expect(matchingAssetClips.map((clip) => [clip.id, clip.timelineStartMs, clip.timelineDurationMs])).toEqual([
      ['imported-before', 0, 300],
      ['pasted-imported', 300, 400],
      ['imported-after', 700, 300],
    ]);
    expect(result.composition.clips.find((clip) => clip.id === 'other-imported')).toMatchObject({
      ...otherImported,
      order: expect.any(Number),
    });
  });

  it('rejects a missing asset without mutating the input composition', () => {
    const existing = visual('existing', 'screen', 'screen-asset', 0, 1_000, {
      trackId: 'screen-track',
      order: 0,
    });
    const copied = visual('copied', 'video', 'missing-asset', 0, 400, {
      trackId: 'source-track',
      order: 1,
    });
    const source = composition([existing], [asset('screen-asset')]);
    const before = JSON.parse(JSON.stringify(source)) as ClipComposition;

    expect(() =>
      pasteClipAt(source, copied, {
        timelineStartMs: 0,
        timelineDurationMs: 1_500,
        targetTrackId: 'screen-track',
      }),
    ).toThrowError(new CompositionEngineError('The copied media is no longer available in this project.'));
    expect(source).toEqual(before);
  });

  it('rejects an out-of-bounds paste atomically', () => {
    const copied = visual('copied', 'video', 'copied-asset', 0, 400, {
      trackId: 'source-track',
      order: 1,
    });
    const source = composition([], [asset('copied-asset')]);
    const before = JSON.parse(JSON.stringify(source)) as ClipComposition;

    expect(() =>
      pasteClipAt(source, copied, {
        timelineStartMs: 200,
        timelineDurationMs: 500,
        targetTrackId: 'video-track',
      }),
    ).toThrowError('The copied item does not fit at the playhead.');
    expect(source).toEqual(before);
  });
});
