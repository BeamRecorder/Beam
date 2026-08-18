import { describe, expect, it } from 'vitest';
import {
  CompositionEngineError,
  createComposition,
  HOLD_SEGMENT_DURATION_MS,
  holdClipAtPlayhead,
  setCameraFraming,
  setCameraLayout,
  setCameraSplitRatio,
  setCameraSplitPadding,
  setCrop,
  setTransform,
  splitClip,
} from './clip-engine';
import type { AudioClip, ClipComposition, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { sourceTimeAt } from '~/media/shared/timeline-mapping';

const videoAsset = (id: string, kind: MediaAsset['kind'] = 'video'): MediaAsset => ({
  id,
  kind,
  name: id,
  fileName: `${id}.${kind === 'audio' ? 'wav' : 'mp4'}`,
  durationMs: 2_000,
  width: kind === 'audio' ? null : 1_920,
  height: kind === 'audio' ? null : 1_080,
  src: `${id}.${kind === 'audio' ? 'wav' : 'mp4'}`,
  origin: 'project',
});

const sessionVideoAsset = (id: string, sessionId = 'session-1'): MediaAsset => ({
  ...videoAsset(id),
  fileName: null,
  origin: 'session',
  sessionId,
  sessionPath: `${id}.webm`,
});

const visual = (
  id: string,
  kind: 'screen' | 'video' | 'image' | 'webcam',
  assetId: string,
  overrides: Partial<VisualClip> = {},
): VisualClip => ({
  id,
  kind,
  name: id,
  assetId,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: kind === 'screen' ? 0 : 1,
  trackId: `${id}-track`,
  groupId: 'recording-segment',
  transform: { x: 0, y: 0, width: 1, height: 1 },
  crop: kind === 'webcam' ? { x: 0.1, y: 0.2, width: 0.7, height: 0.6 } : undefined,
  appearance: createDefaultClipAppearance(kind === 'webcam' ? 'webcam' : kind),
  isMirrored: false,
  isMirroredY: false,
  ...(kind === 'webcam' ? { cameraLayoutPreset: 'custom' as const, cameraFramingPreset: 'custom' as const } : {}),
  ...overrides,
});

const audio = (assetId: string): AudioClip => ({
  id: 'audio',
  kind: 'audio',
  name: 'audio',
  assetId,
  role: 'microphone',
  volume: 83,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 2,
  groupId: 'recording-segment',
});

const compositionFixture = (): ClipComposition => {
  const assets = [videoAsset('screen-asset'), videoAsset('camera-asset'), videoAsset('audio-asset', 'audio')];
  return createComposition(assets, [
    visual('screen', 'screen', 'screen-asset', { trackId: 'screen-track' }),
    visual('camera', 'webcam', 'camera-asset', {
      trackId: 'camera-track',
      transform: { x: 0.65, y: 0.62, width: 0.25, height: 0.3 },
      cameraLayoutPreset: 'custom',
      cameraFramingPreset: 'custom',
    }),
    audio('audio-asset'),
  ]);
};

const ungroupedSessionComposition = (screenSession = 'session-1', cameraSession = 'session-1') =>
  createComposition(
    [sessionVideoAsset('screen-asset', screenSession), sessionVideoAsset('camera-asset', cameraSession)],
    [
      visual('screen', 'screen', 'screen-asset', { groupId: undefined, trackId: 'screen-track' }),
      visual('camera', 'webcam', 'camera-asset', {
        groupId: undefined,
        trackId: 'camera-track',
        transform: { x: 0.65, y: 0.62, width: 0.25, height: 0.3 },
      }),
    ],
  );

const visualPresetComposition = (): ClipComposition =>
  createComposition(
    [videoAsset('screen-asset'), videoAsset('video-asset'), videoAsset('image-asset', 'image')],
    [
      visual('screen-clip', 'screen', 'screen-asset', {
        groupId: undefined,
        trackId: 'screen-clip-track',
        transform: { x: 0.05, y: 0.1, width: 0.7, height: 0.6 },
        crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      }),
      visual('video-clip', 'video', 'video-asset', {
        groupId: undefined,
        trackId: 'video-clip-track',
        transform: { x: 0.2, y: 0.15, width: 0.4, height: 0.35 },
        crop: { x: 0.05, y: 0.15, width: 0.75, height: 0.65 },
      }),
      visual('image-clip', 'image', 'image-asset', {
        groupId: undefined,
        trackId: 'image-clip-track',
        transform: { x: 0.3, y: 0.25, width: 0.3, height: 0.25 },
        crop: { x: 0.2, y: 0.05, width: 0.6, height: 0.85 },
      }),
    ],
  );

describe('camera layout engine operations', () => {
  it.each([
    ['floating-top-left', { x: 0.04, y: 0.04, width: 0.28, height: 0.28 }],
    ['floating-top-right', { x: 0.68, y: 0.04, width: 0.28, height: 0.28 }],
    ['floating-bottom-left', { x: 0.04, y: 0.68, width: 0.28, height: 0.28 }],
    ['floating-bottom-right', { x: 0.68, y: 0.68, width: 0.28, height: 0.28 }],
    ['floating-center', { x: 0.18, y: 0.18, width: 0.64, height: 0.64 }],
    ['fullscreen', { x: 0, y: 0, width: 1, height: 1 }],
  ] as const)('applies %s to screen, video, and image clips', (preset, transform) => {
    const composition = visualPresetComposition();
    const original = new Map(composition.clips.map((clip) => [clip.id, JSON.parse(JSON.stringify(clip))]));

    for (const clipId of ['screen-clip', 'video-clip', 'image-clip']) {
      const next = setCameraLayout(composition, clipId, preset);
      const updated = next.clips.find((clip): clip is VisualClip => clip.id === clipId);

      expect(updated).toMatchObject({
        crop: undefined,
        cameraLayoutPreset: preset,
        cameraFramingPreset: preset === 'fullscreen' ? 'fill' : 'squircle',
      });
      expect(updated?.transform.x).toBeCloseTo(transform.x);
      expect(updated?.transform.y).toBeCloseTo(transform.y);
      expect(updated?.transform.width).toBeCloseTo(transform.width);
      expect(updated?.transform.height).toBeCloseTo(transform.height);
      for (const [otherId, before] of original) {
        if (otherId !== clipId) expect(next.clips.find((clip) => clip.id === otherId)).toEqual(before);
      }
    }
  });

  it.each(['screen-clip', 'video-clip', 'image-clip'] as const)(
    'applies framing presets to %s without changing its transform',
    (clipId) => {
      const composition = visualPresetComposition();
      const before = composition.clips.find((clip): clip is VisualClip => clip.id === clipId)!;
      const next = setCameraFraming(composition, clipId, 'portrait');
      const updated = next.clips.find((clip): clip is VisualClip => clip.id === clipId);

      expect(updated).toMatchObject({
        transform: before.transform,
        crop: undefined,
        cameraLayoutPreset: 'custom',
        cameraFramingPreset: 'portrait',
      });
      expect(next.clips.filter((clip) => clip.id !== clipId)).toEqual(
        composition.clips.filter((clip) => clip.id !== clipId),
      );
    },
  );

  it.each(['screen-clip', 'video-clip', 'image-clip'] as const)(
    'rejects split layouts for the non-camera visual clip %s',
    (clipId) => {
      const composition = visualPresetComposition();
      const before = JSON.parse(JSON.stringify(composition)) as ClipComposition;

      expect(() => setCameraLayout(composition, clipId, 'split-left')).toThrow(CompositionEngineError);
      expect(composition).toEqual(before);
    },
  );

  it.each(['screen-clip', 'video-clip', 'image-clip'] as const)(
    'marks manual transform and crop edits as custom presets for %s',
    (clipId) => {
      const layout = setCameraLayout(visualPresetComposition(), clipId, 'floating-center');
      const transformed = setTransform(layout, clipId, { x: 0.12, y: 0.2, width: 0.52, height: 0.36 });
      const afterTransform = transformed.clips.find((clip): clip is VisualClip => clip.id === clipId)!;
      expect(afterTransform).toMatchObject({
        cameraLayoutPreset: 'custom',
        cameraFramingPreset: 'squircle',
        transform: { x: 0.12, y: 0.2, width: 0.52, height: 0.36 },
      });

      const framed = setCameraFraming(transformed, clipId, 'circle');
      const cropped = setCrop(framed, clipId, { x: 0.15, y: 0.1, width: 0.7, height: 0.75 });
      const afterCrop = cropped.clips.find((clip): clip is VisualClip => clip.id === clipId)!;
      expect(afterCrop).toMatchObject({
        cameraLayoutPreset: 'custom',
        cameraFramingPreset: 'custom',
        crop: { x: 0.15, y: 0.1, width: 0.7, height: 0.75 },
      });
    },
  );

  it('mutates only the camera and linked screen atomically for a split layout', () => {
    const composition = compositionFixture();
    const beforeAudio = composition.clips.find((clip): clip is AudioClip => clip.kind === 'audio');
    const beforeScreen = composition.clips.find((clip): clip is VisualClip => clip.id === 'screen');
    const next = setCameraLayout(composition, 'camera', 'split-right');
    const nextScreen = next.clips.find((clip): clip is VisualClip => clip.id === 'screen');

    expect(next).not.toBe(composition);
    expect(next.clips.find((clip) => clip.id === 'camera')).toMatchObject({
      transform: { x: 0.5, y: 0, width: 0.5, height: 1 },
      crop: undefined,
      cameraLayoutPreset: 'split-right',
      cameraFramingPreset: 'fill',
    });
    expect(nextScreen?.transform).toEqual({
      x: 0,
      y: 0,
      width: 0.5,
      height: 1,
    });
    expect(next.clips.find((clip) => clip.kind === 'audio')).toEqual(beforeAudio);
    expect(nextScreen?.appearance).toEqual(beforeScreen?.appearance);
    expect(nextScreen?.crop).toEqual(beforeScreen?.crop);
  });

  it('sets framing without changing transform or any linked clip', () => {
    const composition = compositionFixture();
    const before = composition.clips.map((clip) => ({ id: clip.id, clip: JSON.parse(JSON.stringify(clip)) }));
    const next = setCameraFraming(composition, 'camera', 'circle');
    const camera = next.clips.find((clip) => clip.id === 'camera') as VisualClip;

    expect(camera.transform).toEqual({ x: 0.65, y: 0.62, width: 0.25, height: 0.3 });
    expect(camera.crop).toBeUndefined();
    expect(camera.cameraFramingPreset).toBe('circle');
    expect(next.clips.find((clip) => clip.id === 'screen')).toEqual(before.find(({ id }) => id === 'screen')?.clip);
    expect(next.clips.find((clip) => clip.id === 'audio')).toEqual(before.find(({ id }) => id === 'audio')?.clip);
  });

  it('adjusts the camera share and complementary screen area for a split', () => {
    const split = setCameraLayout(compositionFixture(), 'camera', 'split-right');
    const beforeAudio = split.clips.find((clip): clip is AudioClip => clip.kind === 'audio');
    const next = setCameraSplitRatio(split, 'camera', 0.7);

    const camera = next.clips.find((clip): clip is VisualClip => clip.id === 'camera');
    expect(camera).toMatchObject({
      cameraSplitRatio: 0.7,
      cameraLayoutPreset: 'split-right',
    });
    expect(camera?.transform.x).toBeCloseTo(0.3);
    expect(camera?.transform.width).toBeCloseTo(0.7);
    const screen = next.clips.find((clip): clip is VisualClip => clip.id === 'screen');
    expect(screen?.transform.width).toBeCloseTo(0.3);
    expect(next.clips.find((clip) => clip.kind === 'audio')).toEqual(beforeAudio);
  });

  it('keeps split padding when a manual camera move makes only the camera custom', () => {
    const split = setCameraLayout(compositionFixture(), 'camera', 'split-left');
    const padded = setCameraSplitPadding(split, 'camera', 0.04);
    const beforeCamera = padded.clips.find((clip): clip is VisualClip => clip.id === 'camera')!;
    const beforeScreen = padded.clips.find((clip): clip is VisualClip => clip.id === 'screen')!;
    const beforeAudio = padded.clips.find((clip): clip is AudioClip => clip.kind === 'audio')!;

    expect(beforeCamera.cameraSplitPadding).toBe(0.04);
    expect(beforeCamera.transform).toEqual({ x: 0.04, y: 0.04, width: 0.42, height: 0.92 });
    expect(beforeScreen.transform).toEqual({ x: 0.54, y: 0.04, width: 0.42, height: 0.92 });
    expect(setTransform(padded, 'camera', beforeCamera.transform).clips.find((clip) => clip.id === 'camera')).toEqual(
      beforeCamera,
    );

    const requested = { ...beforeCamera.transform, x: 0.12, y: 0.08 };
    const moved = setTransform(padded, 'camera', requested);
    const movedCamera = moved.clips.find((clip): clip is VisualClip => clip.id === 'camera');
    const movedScreen = moved.clips.find((clip): clip is VisualClip => clip.id === 'screen');
    expect(movedCamera).toMatchObject({
      cameraLayoutPreset: 'custom',
      cameraSplitRatio: beforeCamera.cameraSplitRatio,
      cameraSplitPadding: beforeCamera.cameraSplitPadding,
      cameraFramingPreset: beforeCamera.cameraFramingPreset,
      transform: requested,
    });
    expect(movedScreen).toEqual(beforeScreen);
    expect(moved.clips.find((clip): clip is AudioClip => clip.kind === 'audio')).toEqual(beforeAudio);
  });

  it('keeps the linked screen and audio unchanged when resizing a padded split camera', () => {
    const split = setCameraLayout(compositionFixture(), 'camera', 'split-right');
    const padded = setCameraSplitPadding(split, 'camera', 0.04);
    const beforeCamera = padded.clips.find((clip): clip is VisualClip => clip.id === 'camera')!;
    const beforeScreen = padded.clips.find((clip): clip is VisualClip => clip.id === 'screen')!;
    const beforeAudio = padded.clips.find((clip): clip is AudioClip => clip.kind === 'audio')!;
    const requested = { x: 0.44, y: 0.04, width: 0.52, height: 0.92 };
    const resized = setTransform(padded, 'camera', requested);
    const camera = resized.clips.find((clip): clip is VisualClip => clip.id === 'camera');
    const screen = resized.clips.find((clip): clip is VisualClip => clip.id === 'screen');

    expect(camera).toMatchObject({
      cameraLayoutPreset: 'custom',
      cameraSplitRatio: beforeCamera.cameraSplitRatio,
      cameraSplitPadding: beforeCamera.cameraSplitPadding,
      cameraFramingPreset: beforeCamera.cameraFramingPreset,
      transform: requested,
    });
    expect(screen).toEqual(beforeScreen);
    expect(resized.clips.find((clip): clip is AudioClip => clip.kind === 'audio')).toEqual(beforeAudio);
  });

  it('requires a linked screen for split layouts and leaves the composition untouched on failure', () => {
    const composition = compositionFixture();
    const detached = createComposition(
      composition.assets,
      composition.clips.filter((clip) => clip.id !== 'screen').map((clip) => ({ ...clip, groupId: undefined })),
      composition.keyboardCaptionSessions,
    );

    expect(() => setCameraLayout(detached, 'camera', 'split-left')).toThrow(CompositionEngineError);
    expect(detached.clips.find((clip) => clip.id === 'camera')).toMatchObject({
      transform: { x: 0.65, y: 0.62, width: 0.25, height: 0.3 },
      cameraLayoutPreset: 'custom',
      cameraFramingPreset: 'custom',
    });
  });

  it('infers and persists a same-session screen partner atomically for an ungrouped split', () => {
    const composition = ungroupedSessionComposition();
    expect(composition.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'screen-asset', origin: 'session', sessionId: 'session-1' }),
        expect.objectContaining({ id: 'camera-asset', origin: 'session', sessionId: 'session-1' }),
      ]),
    );
    const beforeAudio = audio('unused-audio-asset');
    const overlayAsset = videoAsset('overlay-asset');
    const overlay = visual('overlay', 'video', overlayAsset.id, {
      groupId: undefined,
      trackId: 'overlay-track',
      order: 3,
      transform: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    });
    const withUnchangedLayers = createComposition(
      [...composition.assets, videoAsset('unused-audio-asset', 'audio'), overlayAsset],
      [...composition.clips, { ...beforeAudio, groupId: undefined }, overlay],
    );
    const before = JSON.parse(JSON.stringify(withUnchangedLayers)) as ClipComposition;
    const originalAudio = withUnchangedLayers.clips.find((clip): clip is AudioClip => clip.kind === 'audio');
    const originalOverlay = withUnchangedLayers.clips.find((clip): clip is VisualClip => clip.id === 'overlay');

    const next = setCameraLayout(withUnchangedLayers, 'camera', 'split-right');
    const camera = next.clips.find((clip): clip is VisualClip => clip.id === 'camera');
    const screen = next.clips.find((clip): clip is VisualClip => clip.id === 'screen');

    expect(camera?.groupId).toBeTruthy();
    expect(screen?.groupId).toBe(camera?.groupId);
    expect(camera).toMatchObject({
      transform: { x: 0.5, y: 0, width: 0.5, height: 1 },
      crop: undefined,
      cameraLayoutPreset: 'split-right',
      cameraFramingPreset: 'fill',
    });
    expect(screen?.transform).toEqual({ x: 0, y: 0, width: 0.5, height: 1 });
    expect(next.clips.find((clip) => clip.kind === 'audio')).toEqual(originalAudio);
    expect(next.clips.find((clip) => clip.id === 'overlay')).toEqual(originalOverlay);
    expect(withUnchangedLayers).toEqual(before);

    let id = 0;
    const split = splitClip(next, 'camera', 400, () => `generated-${++id}`);
    const leftCamera = split.clips.find(
      (clip): clip is VisualClip => clip.kind === 'webcam' && clip.timelineStartMs === 0,
    );
    const rightCamera = split.clips.find(
      (clip): clip is VisualClip => clip.kind === 'webcam' && clip.timelineStartMs === 400,
    );
    const leftScreen = split.clips.find(
      (clip): clip is VisualClip => clip.kind === 'screen' && clip.timelineStartMs === 0,
    );
    const rightScreen = split.clips.find(
      (clip): clip is VisualClip => clip.kind === 'screen' && clip.timelineStartMs === 400,
    );

    expect(leftCamera?.groupId).toBe(leftScreen?.groupId);
    expect(rightCamera?.groupId).toBe(rightScreen?.groupId);
    expect(leftCamera?.groupId).not.toBe(rightCamera?.groupId);
    expect(split.clips.find((clip) => clip.kind === 'audio')).toEqual(originalAudio);
    expect(split.clips.find((clip) => clip.id === 'overlay')).toEqual(originalOverlay);
  });

  it('supports a unique overlapping screen fragment without creating an invalid timing group', () => {
    const cameraGroupId = 'legacy-camera-audio-group';
    const composition = createComposition(
      [sessionVideoAsset('screen-asset'), sessionVideoAsset('camera-asset'), videoAsset('audio-asset', 'audio')],
      [
        visual('screen', 'screen', 'screen-asset', {
          groupId: undefined,
          timelineDurationMs: 2_573,
          sourceInMs: 7_875,
          sourceDurationMs: 2_573,
        }),
        visual('camera', 'webcam', 'camera-asset', {
          groupId: cameraGroupId,
          timelineDurationMs: 10_810,
          sourceDurationMs: 10_810,
        }),
        {
          ...audio('audio-asset'),
          groupId: cameraGroupId,
          timelineDurationMs: 10_810,
          sourceDurationMs: 10_810,
        },
      ],
    );
    const originalAudio = composition.clips.find((clip): clip is AudioClip => clip.kind === 'audio');

    const split = setCameraLayout(composition, 'camera', 'split-left');
    const splitCamera = split.clips.find((clip): clip is VisualClip => clip.id === 'camera');
    const splitScreen = split.clips.find((clip): clip is VisualClip => clip.id === 'screen');
    expect(splitCamera?.groupId).toBe(cameraGroupId);
    expect(splitScreen?.groupId).toBeUndefined();
    expect(splitCamera?.transform).toEqual({ x: 0, y: 0, width: 0.5, height: 1 });
    expect(splitScreen?.transform).toEqual({ x: 0.5, y: 0, width: 0.5, height: 1 });
    expect(split.clips.find((clip) => clip.kind === 'audio')).toEqual(originalAudio);

    const floating = setCameraLayout(split, 'camera', 'floating-top-left');
    expect(floating.clips.find((clip): clip is VisualClip => clip.id === 'screen')?.transform).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
    expect(floating.clips.find((clip) => clip.kind === 'audio')).toEqual(originalAudio);
  });

  it.each([
    ['different sessions', ungroupedSessionComposition('session-screen', 'session-camera')],
    [
      'ambiguous screen candidates',
      createComposition(
        [sessionVideoAsset('screen-a-asset'), sessionVideoAsset('screen-b-asset'), sessionVideoAsset('camera-asset')],
        [
          visual('screen-a', 'screen', 'screen-a-asset', { groupId: undefined, trackId: 'screen-a-track' }),
          visual('screen-b', 'screen', 'screen-b-asset', { groupId: undefined, trackId: 'screen-b-track' }),
          visual('camera', 'webcam', 'camera-asset', { groupId: undefined, trackId: 'camera-track' }),
        ],
      ),
    ],
  ])('rejects a split when there is no unique compatible screen (%s)', (_reason, composition) => {
    const before = JSON.parse(JSON.stringify(composition)) as ClipComposition;

    expect(() => setCameraLayout(composition, 'camera', 'split-left')).toThrow(CompositionEngineError);
    expect(composition).toEqual(before);
  });

  it('marks manual camera transform and crop edits as custom presets', () => {
    const composition = setCameraLayout(compositionFixture(), 'camera', 'floating-bottom-right');
    const transformed = setTransform(composition, 'camera', { x: 0.2, y: 0.3, width: 0.4, height: 0.25 });
    const cropped = setCrop(transformed, 'camera', { x: 0.1, y: 0.1, width: 0.8, height: 0.7 });
    const camera = cropped.clips.find((clip) => clip.id === 'camera') as VisualClip;

    expect(camera.cameraLayoutPreset).toBe('custom');
    expect(camera.cameraFramingPreset).toBe('custom');
    expect(camera.transform).toEqual({ x: 0.2, y: 0.3, width: 0.4, height: 0.25 });
    expect(camera.crop).toEqual({ x: 0.1, y: 0.1, width: 0.8, height: 0.7 });
  });

  it('inherits layout and framing on both split fragments, then keeps later changes independent', () => {
    const initial = setCameraLayout(compositionFixture(), 'camera', 'split-right');
    let id = 0;
    const split = splitClip(initial, 'camera', 400, () => `generated-${++id}`);
    const leftCamera = split.clips.find((clip) => clip.kind === 'webcam' && clip.timelineStartMs === 0) as VisualClip;
    const rightCamera = split.clips.find(
      (clip) => clip.kind === 'webcam' && clip.timelineStartMs === 400,
    ) as VisualClip;
    const leftScreen = split.clips.find((clip) => clip.kind === 'screen' && clip.timelineStartMs === 0) as VisualClip;
    const rightScreen = split.clips.find(
      (clip) => clip.kind === 'screen' && clip.timelineStartMs === 400,
    ) as VisualClip;

    expect(leftCamera).toMatchObject({ cameraLayoutPreset: 'split-right', cameraFramingPreset: 'fill' });
    expect(rightCamera).toMatchObject({ cameraLayoutPreset: 'split-right', cameraFramingPreset: 'fill' });
    expect(leftCamera.transform).toEqual(rightCamera.transform);
    expect(leftScreen.transform).toEqual(rightScreen.transform);
    expect(leftCamera.groupId).not.toBe(rightCamera.groupId);

    const changed = setCameraLayout(split, rightCamera.id, 'split-top');
    expect(changed.clips.find((clip) => clip.id === leftCamera.id)).toMatchObject({
      transform: { x: 0.5, y: 0, width: 0.5, height: 1 },
      cameraLayoutPreset: 'split-right',
    });
    const changedLeftScreen = changed.clips.find((clip): clip is VisualClip => clip.id === leftScreen.id);
    const changedRightScreen = changed.clips.find((clip): clip is VisualClip => clip.id === rightScreen.id);
    expect(changedLeftScreen?.transform).toEqual({
      x: 0,
      y: 0,
      width: 0.5,
      height: 1,
    });
    expect(changed.clips.find((clip) => clip.id === rightCamera.id)).toMatchObject({
      transform: { x: 0, y: 0, width: 1, height: 0.5 },
      cameraLayoutPreset: 'split-top',
      cameraFramingPreset: 'fill',
    });
    expect(changedRightScreen?.transform).toEqual({
      x: 0,
      y: 0.5,
      width: 1,
      height: 0.5,
    });
  });
});

describe('hold clip engine operation', () => {
  it('captures the exact source frame and inserts a one-second frozen segment', () => {
    const composition = createComposition(
      [videoAsset('video-asset')],
      [
        visual('video', 'video', 'video-asset', {
          groupId: undefined,
          trackId: 'video-track',
          timelineStartMs: 1_000,
          timelineDurationMs: 4_000,
          sourceInMs: 125,
          sourceDurationMs: 5_000,
          playbackRate: 1.25,
        }),
      ],
    );
    let id = 0;
    const sourceAtPlayhead = sourceTimeAt(composition.clips[0]!, 2_400)!;

    const held = holdClipAtPlayhead(composition, 'video', 2_400, () => `generated-${++id}`);
    const segments = held.clips
      .filter((clip): clip is VisualClip => clip.kind === 'video')
      .sort((left, right) => left.timelineStartMs - right.timelineStartMs);
    const [left, freeze, right] = segments;

    expect(segments).toHaveLength(3);
    expect(left).toMatchObject({
      timelineStartMs: 1_000,
      timelineDurationMs: 1_400,
      sourceInMs: 125,
      sourceDurationMs: 1_750,
    });
    expect(freeze).toMatchObject({
      timelineStartMs: 2_400,
      timelineDurationMs: HOLD_SEGMENT_DURATION_MS,
      sourceInMs: sourceAtPlayhead,
      sourceDurationMs: HOLD_SEGMENT_DURATION_MS,
      playbackRate: 1,
      freezeFrameSourceMs: sourceAtPlayhead,
    });
    expect(sourceAtPlayhead).toBe(1_875);
    expect(sourceTimeAt(freeze!, 2_400)).toBe(sourceAtPlayhead);
    expect(sourceTimeAt(freeze!, 3_399)).toBe(sourceAtPlayhead);
    expect(right).toMatchObject({
      timelineStartMs: 3_400,
      timelineDurationMs: 2_600,
      sourceInMs: 1_875,
      sourceDurationMs: 3_250,
      playbackRate: 1.25,
    });
    expect(right?.freezeFrameSourceMs).toBeUndefined();
  });

  it('splits linked screen, webcam, and audio while leaving a one-second audio gap', () => {
    let id = 0;
    const held = holdClipAtPlayhead(compositionFixture(), 'camera', 400, () => `generated-${++id}`);
    const left = held.clips.filter((clip) => clip.timelineStartMs === 0);
    const holds = held.clips.filter(
      (clip): clip is VisualClip => 'freezeFrameSourceMs' in clip && clip.freezeFrameSourceMs !== undefined,
    );
    const right = held.clips.filter((clip) => clip.timelineStartMs === 1_400);

    expect(held.clips).toHaveLength(8);
    expect(left.map((clip) => clip.kind).sort()).toEqual(['audio', 'screen', 'webcam']);
    expect(holds.map((clip) => clip.kind).sort()).toEqual(['screen', 'webcam']);
    expect(right.map((clip) => clip.kind).sort()).toEqual(['audio', 'screen', 'webcam']);
    expect(new Set(left.map((clip) => clip.groupId))).toEqual(new Set(['recording-segment']));
    const holdGroupId = holds[0]?.groupId;
    const rightGroupId = right[0]?.groupId;
    expect(holdGroupId).toBeTruthy();
    expect(rightGroupId).toBeTruthy();
    expect(new Set(holds.map((clip) => clip.groupId))).toEqual(new Set([holdGroupId]));
    expect(new Set(right.map((clip) => clip.groupId))).toEqual(new Set([rightGroupId]));
    expect(rightGroupId).not.toBe(holdGroupId);
    expect(rightGroupId).not.toBe('recording-segment');

    for (const clip of holds) {
      expect(clip).toMatchObject({
        timelineStartMs: 400,
        timelineDurationMs: HOLD_SEGMENT_DURATION_MS,
        sourceInMs: 400,
        sourceDurationMs: HOLD_SEGMENT_DURATION_MS,
        playbackRate: 1,
        freezeFrameSourceMs: 400,
      });
    }

    const audioSegments = held.clips.filter((clip): clip is AudioClip => clip.kind === 'audio');
    const audioLeft = audioSegments.find((clip) => clip.timelineStartMs === 0)!;
    const audioRight = audioSegments.find((clip) => clip.timelineStartMs === 1_400)!;
    expect(audioLeft).toMatchObject({ timelineDurationMs: 400, sourceInMs: 0, sourceDurationMs: 400 });
    expect(audioRight).toMatchObject({ timelineDurationMs: 600, sourceInMs: 400, sourceDurationMs: 600 });
    expect(sourceTimeAt(audioLeft, 399)).toBe(399);
    expect(sourceTimeAt(audioLeft, 400)).toBeNull();
    expect(sourceTimeAt(audioRight, 1_399)).toBeNull();
    expect(sourceTimeAt(audioRight, 1_400)).toBe(400);
  });

  it('pushes downstream fragments and their grouped companions while leaving other tracks in place', () => {
    const composition = createComposition(
      [
        videoAsset('main-asset'),
        videoAsset('later-asset'),
        videoAsset('later-companion-asset'),
        videoAsset('other-asset'),
      ],
      [
        visual('main', 'video', 'main-asset', {
          groupId: undefined,
          trackId: 'video-track',
          timelineDurationMs: 2_000,
          sourceDurationMs: 2_000,
        }),
        visual('later', 'video', 'later-asset', {
          groupId: 'later-group',
          trackId: 'video-track',
          timelineStartMs: 2_000,
          timelineDurationMs: 500,
          sourceDurationMs: 500,
        }),
        visual('later-companion', 'webcam', 'later-companion-asset', {
          groupId: 'later-group',
          trackId: 'camera-track',
          timelineStartMs: 2_000,
          timelineDurationMs: 500,
          sourceDurationMs: 500,
        }),
        visual('other-track', 'video', 'other-asset', {
          groupId: undefined,
          trackId: 'other-track',
          timelineStartMs: 2_000,
          timelineDurationMs: 500,
          sourceDurationMs: 500,
        }),
      ],
    );

    let id = 0;
    const held = holdClipAtPlayhead(composition, 'main', 1_000, () => `generated-${++id}`);
    const later = held.clips.find((clip) => clip.id === 'later')!;
    const laterCompanion = held.clips.find((clip) => clip.id === 'later-companion')!;
    const otherTrack = held.clips.find((clip) => clip.id === 'other-track')!;
    const right = held.clips.find((clip) => clip.id === 'generated-1')!;

    expect(right).toMatchObject({ timelineStartMs: 2_000, timelineDurationMs: 1_000 });
    expect(later).toMatchObject({ timelineStartMs: 3_000, timelineDurationMs: 500 });
    expect(laterCompanion).toMatchObject({ timelineStartMs: 3_000, timelineDurationMs: 500 });
    expect(otherTrack).toMatchObject({ timelineStartMs: 2_000, timelineDurationMs: 500 });
    expect(later.sourceInMs).toBe(0);
    expect(later.sourceDurationMs).toBe(500);
  });

  it('rejects images, existing holds, and playhead boundary positions', () => {
    const composition = visualPresetComposition();

    expect(() => holdClipAtPlayhead(composition, 'image-clip', 500, () => 'unused')).toThrow(
      'Only video clips can be held.',
    );
    expect(() => holdClipAtPlayhead(composition, 'video-clip', 0, () => 'unused')).toThrow(
      'Hold must be inside the clip.',
    );
    expect(() => holdClipAtPlayhead(composition, 'video-clip', 1_000, () => 'unused')).toThrow(
      'Hold must be inside the clip.',
    );

    let id = 0;
    const held = holdClipAtPlayhead(composition, 'video-clip', 500, () => `generated-${++id}`);
    const freeze = held.clips.find(
      (clip): clip is VisualClip => 'freezeFrameSourceMs' in clip && clip.freezeFrameSourceMs !== undefined,
    )!;
    expect(() => holdClipAtPlayhead(held, freeze.id, 750, () => 'unused')).toThrow('Only video clips can be held.');
  });
});
